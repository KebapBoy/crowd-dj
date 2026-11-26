import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Catalog } from './catalog'
import type { Database } from './db/open'
import { inbox, inboxItem, session, spotifyAccount, type Inbox } from './db/schema'
import { errorSummary } from './errors'
import { PLAYLIST_REMOVE_LIMIT, type PlaylistEntry, type SpotifyApi } from './spotify/api'
import { allowsInbox } from './spotify/oauth'

/** How often the inboxes of hosts with an open session are looked at. */
export const INBOX_SYNC_MS = 60 * 1000
/** Items of an inbox read at most; one that holds more is read only this far. */
export const INBOX_ITEMS_MAX = 500
/** Looks in a row at which Spotify does not know an inbox's playlist before it is forgotten. */
export const INBOX_MISSES = 3
/** Longest invitation link a host can store. */
const INVITE_URL_MAX = 500

/** What pages see of an inbox. */
export interface InboxView {
    id: string
    /** Set for the inbox of one session. */
    sessionId: string | null
    spotifyUrl: string
    /** The invitation to collaborate, once the host stored it. */
    inviteUrl: string | null
    syncedAt: Date | null
    /** Tracks in it when it was last read. */
    tracks: number
}

/** What one look at the open inboxes changed. */
export interface SyncResult {
    /** Profiles whose pools got tracks from an inbox. */
    profiles: Set<string>
    /** Sessions whose inbox is gone (the host deleted the playlist in Spotify). */
    sessions: Set<string>
}

export type InboxApi = Pick<
    SpotifyApi,
    'createPlaylist' | 'playlistSnapshot' | 'playlistItems' | 'removeFromPlaylist'
>

/**
 * An invitation link to an inbox as the Spotify app shares it: a link to that playlist on
 * open.spotify.com (with its `pt` invitation), or a short link of the Spotify app (spotify.link),
 * which cannot be checked further. Null for anything else.
 */
export function parseInviteUrl(value: unknown, playlistId: string): string | null {
    if (typeof value !== 'string' || value.trim().length > INVITE_URL_MAX) return null
    let url: URL
    try {
        url = new URL(value.trim())
    } catch {
        return null
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    if (url.hostname === 'spotify.link' && /^\/[0-9A-Za-z]{1,64}$/.test(url.pathname))
        return `https://spotify.link${url.pathname}`
    if (url.hostname !== 'open.spotify.com') return null
    const id = /^\/(?:intl-[a-z]{2}(?:-[A-Za-z]{2})?\/)?playlist\/([0-9A-Za-z]{22})\/?$/.exec(
        url.pathname
    )?.[1]
    if (id !== playlistId) return null
    return `https://open.spotify.com${url.pathname}${url.search}`
}

const playlistUrl = (id: string) => `https://open.spotify.com/playlist/${id}`

export function createInboxes({
    db,
    api,
    catalog,
    now = () => new Date()
}: {
    db: Database
    api: InboxApi
    catalog: Pick<Catalog, 'keep'>
    now?: () => Date
}) {
    let syncing: Promise<SyncResult> | null = null
    /** The last failure per inbox, logged once until it changes or the inbox works again. */
    const failures = new Map<string, string>()
    /** Looks in a row at which Spotify did not know an inbox's playlist. */
    const misses = new Map<string, number>()

    async function view(row: Inbox): Promise<InboxView> {
        const [{ tracks }] = await db
            .select({ tracks: sql<number>`count(distinct ${inboxItem.trackId})` })
            .from(inboxItem)
            .where(eq(inboxItem.inboxId, row.id))
        return {
            id: row.id,
            sessionId: row.sessionId,
            spotifyUrl: playlistUrl(row.id),
            inviteUrl: row.inviteUrl,
            syncedAt: row.syncedAt,
            tracks
        }
    }

    const lastingOf = (hostId: string) =>
        db.query.inbox.findFirst({ where: and(eq(inbox.hostId, hostId), isNull(inbox.sessionId)) })

    const ofSession = (sessionId: string) =>
        db.query.inbox.findFirst({ where: eq(inbox.sessionId, sessionId) })

    /**
     * Puts the inbox items not imported yet into the pools of the profiles linked to whoever added
     * them, as added when they were added to the playlist (a track already in a pool counts as
     * added then, if that is later). Only into profiles that are in an open session of the inbox's
     * host: a link to a Spotify user is not proven, so it must not open the inboxes of hosts whose
     * sessions the profile is not in. Limited to one inbox, or to one Spotify user who was just
     * linked. Returns the profiles whose pools changed.
     */
    async function importItems(where: { inboxId: string } | { addedBy: string }) {
        const scope =
            'inboxId' in where
                ? sql`i.inbox_id = ${where.inboxId}`
                : sql`i.added_by = ${where.addedBy}`
        const pending = sql`from inbox_item i
            join inbox b on b.id = i.inbox_id
            join profile p on p.spotify_user_id = i.added_by
            where ${scope} and i.imported_at is null and exists (
                select 1 from session_member m join session s on s.id = m.session_id
                where m.profile_id = p.id and m.left_at is null
                    and s.host_id = b.host_id and s.ended_at is null)`
        // All in one batch, so an item is imported exactly once and its profile is the one noted
        const [profiles] = await db.batch([
            db.all<{ id: string }>(sql`select distinct p.id as id ${pending}`),
            db.run(sql`insert into pool_item (profile_id, track_id, added_at)
                select p.id, i.track_id, max(i.added_at) ${pending}
                group by p.id, i.track_id
                on conflict (profile_id, track_id)
                    do update set added_at = max(added_at, excluded.added_at)`),
            db.run(sql`update inbox_item set imported_at = ${now().getTime()},
                    imported_to = (select p.id from profile p
                        where p.spotify_user_id = inbox_item.added_by)
                where rowid in (select i.rowid ${pending})`)
        ])
        return profiles.map((row) => row.id)
    }

    /**
     * Reads the inbox, its first `INBOX_ITEMS_MAX` items (whatever they are: episodes count too,
     * so the requests are bounded), and stores what it holds. False when the playlist is gone.
     */
    async function read(row: Inbox, snapshotId: string): Promise<boolean> {
        const entries: PlaylistEntry[] = []
        let offset: number | null = 0
        while (offset !== null && offset < INBOX_ITEMS_MAX) {
            const page = await api.playlistItems(row.hostId, row.id, offset)
            if (!page) return false
            entries.push(...page.items)
            offset = page.next
        }
        await catalog.keep(entries.map((entry) => entry.track))
        // An item added twice by the same person counts once, as added the last time. Items
        // without the one who added them are kept under an empty name: never imported, but their
        // tracks are not tidied away
        const items = new Map<string, PlaylistEntry & { addedBy: string }>()
        for (const entry of entries) {
            const addedBy = entry.addedBy ?? ''
            const key = `${entry.track.id}\n${addedBy}`
            const seen = items.get(key)
            if (!seen || seen.addedAt < entry.addedAt) items.set(key, { ...entry, addedBy })
        }
        const values = [...items.values()].map((entry) => ({
            inboxId: row.id,
            trackId: entry.track.id,
            addedBy: entry.addedBy,
            addedAt: entry.addedAt
        }))
        const kept = sql.join(
            values.map((value) => sql`(${value.trackId}, ${value.addedBy})`),
            sql`, `
        )
        // Items still there keep when they were imported; items gone are forgotten, so a track
        // added again later is imported again
        await db.batch([
            db.run(
                values.length > 0
                    ? sql`delete from inbox_item where inbox_id = ${row.id}
                        and (track_id, added_by) not in (values ${kept})`
                    : sql`delete from inbox_item where inbox_id = ${row.id}`
            ),
            ...(values.length > 0
                ? [db.insert(inboxItem).values(values).onConflictDoNothing()]
                : []),
            db
                .update(inbox)
                .set({ snapshotId, complete: offset === null, syncedAt: now() })
                .where(eq(inbox.id, row.id))
        ])
        return true
    }

    /**
     * With a pool limit in the host's open session, removes from the inbox the tracks of linked
     * people that are in their pool but no longer among its newest (the limit's window): they stay
     * in the pool. A copy counts only while the profile it went into is still linked to whoever
     * added it, so a link that moves to another profile removes nothing, and a track taken out of
     * the pool stays in the playlist. Spotify removes a track every time it is in the playlist, so
     * a track stays while any other copy of it does (within someone's window, not imported, added
     * by someone nobody linked, or not attributed). A playlist read only in part is left alone.
     */
    async function tidy(row: Inbox, limit: number | null) {
        if (limit === null) return
        const current = await db.query.inbox.findFirst({ where: eq(inbox.id, row.id) })
        if (!current?.complete) return
        const rows = await db.all<{ trackId: string; excess: number }>(sql`
            select i.track_id as trackId, min(
                p.id is not null
                and exists (select 1 from pool_item a
                    where a.profile_id = p.id and a.track_id = i.track_id)
                and i.track_id not in (
                    select w.track_id from pool_item w where w.profile_id = p.id
                    order by w.added_at desc limit ${limit})
            ) as excess
            from inbox_item i
            left join profile p on p.id = i.imported_to and p.spotify_user_id = i.added_by
            where i.inbox_id = ${row.id}
            group by i.track_id`)
        const excess = rows.filter((item) => item.excess).map((item) => item.trackId)
        let expected = current.snapshotId
        for (let i = 0; i < excess.length; i += PLAYLIST_REMOVE_LIMIT) {
            const batch = excess.slice(i, i + PLAYLIST_REMOVE_LIMIT)
            // Removing hits every copy: not when someone added one that was not read yet
            if (expected === null || (await api.playlistSnapshot(row.hostId, row.id)) !== expected)
                return
            expected = await api.removeFromPlaylist(row.hostId, row.id, batch)
            // Read again next time: others may have changed the playlist meanwhile
            await db.batch([
                db
                    .delete(inboxItem)
                    .where(and(eq(inboxItem.inboxId, row.id), inArray(inboxItem.trackId, batch))),
                db.update(inbox).set({ snapshotId: null }).where(eq(inbox.id, row.id))
            ])
        }
    }

    /**
     * Looks at one inbox: reads it when it changed, imports new items and tidies it up. Returns the
     * profiles whose pools changed, or null when the playlist is gone (and the inbox with it).
     */
    async function sync(row: Inbox, limit: number | null): Promise<string[] | null> {
        const snapshotId = await api.playlistSnapshot(row.hostId, row.id)
        if (
            snapshotId === null ||
            (snapshotId !== row.snapshotId && !(await read(row, snapshotId)))
        )
            return missing(row)
        misses.delete(row.id)
        const profiles = await importItems({ inboxId: row.id })
        await tidy(row, limit)
        return profiles
    }

    /**
     * Spotify did not know the playlist. Only when that happens `INBOX_MISSES` times in a row is
     * the inbox forgotten (with its invitation), so one odd answer does not lose it. Returns null
     * once it is forgotten, else no profiles.
     */
    async function missing(row: Inbox): Promise<string[] | null> {
        const count = (misses.get(row.id) ?? 0) + 1
        if (count < INBOX_MISSES) {
            misses.set(row.id, count)
            return []
        }
        misses.delete(row.id)
        await db.delete(inbox).where(eq(inbox.id, row.id))
        return null
    }

    async function syncOpen(): Promise<SyncResult> {
        const result: SyncResult = { profiles: new Set(), sessions: new Set() }
        // The inboxes of hosts with an open session: the host's lasting one and the session's own
        const rows = await db
            .select({ inbox, scope: spotifyAccount.scope, session })
            .from(session)
            .innerJoin(spotifyAccount, eq(spotifyAccount.id, session.hostId))
            .innerJoin(
                inbox,
                and(
                    eq(inbox.hostId, session.hostId),
                    sql`(${inbox.sessionId} is null or ${inbox.sessionId} = ${session.id})`
                )
            )
            .where(isNull(session.endedAt))
        for (const row of rows) {
            // Without the scopes, "My account" asks the host to allow them again
            if (!allowsInbox(row.scope)) continue
            try {
                const changed = await sync(row.inbox, row.session.maxPoolSize)
                failures.delete(row.inbox.id)
                if (changed === null) {
                    if (row.inbox.sessionId) result.sessions.add(row.inbox.sessionId)
                } else for (const id of changed) result.profiles.add(id)
            } catch (error) {
                // Once per inbox and kind of failure, not every minute
                const summary = errorSummary(error)
                if (failures.get(row.inbox.id) !== summary)
                    console.error(`Inbox ${row.inbox.id}:`, summary)
                failures.set(row.inbox.id, summary)
            }
        }
        return result
    }

    return {
        /** The host's lasting inbox, if they set one up. */
        async lasting(hostId: string): Promise<InboxView | null> {
            const row = await lastingOf(hostId)
            return row ? view(row) : null
        },

        /** Whether the host has an inbox in use: the lasting one, or one of an open session. */
        async hasAny(hostId: string): Promise<boolean> {
            const row = await db.query.inbox.findFirst({
                columns: { id: true },
                where: and(
                    eq(inbox.hostId, hostId),
                    sql`(${inbox.sessionId} is null or ${inbox.sessionId} in
                        (select id from session where ended_at is null))`
                )
            })
            return !!row
        },

        /** The session's own inbox, if the host made one. */
        async forSession(sessionId: string): Promise<InboxView | null> {
            const row = await ofSession(sessionId)
            return row ? view(row) : null
        },

        /**
         * Creates an inbox playlist in the host's Spotify account: the host's lasting one, or one for
         * a session. Returns the one there is when it exists already.
         */
        async create(
            hostId: string,
            sessionId: string | null,
            playlist: { name: string; description: string }
        ): Promise<InboxView> {
            const existing = await (sessionId ? ofSession(sessionId) : lastingOf(hostId))
            if (existing) return view(existing)
            const id = await api.createPlaylist(hostId, playlist.name, playlist.description)
            // A create at the same moment loses on the unique index and gets the other one; its
            // playlist stays empty in the host's library
            await db
                .insert(inbox)
                .values({ id, hostId, sessionId, createdAt: now() })
                .onConflictDoNothing()
            const row = await (sessionId ? ofSession(sessionId) : lastingOf(hostId))
            return view(row!)
        },

        /** Stores the invitation link of the host's inbox; false when it is not one to it. */
        async setInvite(hostId: string, inboxId: string, value: unknown): Promise<boolean> {
            const inviteUrl = value === '' ? null : parseInviteUrl(value, inboxId)
            if (value !== '' && !inviteUrl) return false
            const result = await db
                .update(inbox)
                .set({ inviteUrl })
                .where(and(eq(inbox.id, inboxId), eq(inbox.hostId, hostId)))
            return result.rowsAffected > 0
        },

        /** Forgets the host's inbox; the playlist stays in their Spotify library. */
        async forget(hostId: string, inboxId: string) {
            await db.delete(inbox).where(and(eq(inbox.id, inboxId), eq(inbox.hostId, hostId)))
        },

        /** Imports what a Spotify user added to any inbox, right after a profile was linked to it. */
        importFor(spotifyUserId: string) {
            return importItems({ addedBy: spotifyUserId })
        },

        /**
         * Looks at the inboxes of hosts with an open session. One look at a time: a look that is
         * still running is shared.
         */
        syncOpen(): Promise<SyncResult> {
            syncing ??= syncOpen().finally(() => (syncing = null))
            return syncing
        }
    }
}

export type Inboxes = ReturnType<typeof createInboxes>
