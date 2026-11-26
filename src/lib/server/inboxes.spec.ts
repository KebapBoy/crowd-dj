import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCatalog } from './catalog'
import { migrateDatabase } from './db/migrate'
import { openDatabase, type Database } from './db/open'
import { spotifyAccount } from './db/schema'
import { createInboxes, INBOX_MISSES, parseInviteUrl, type InboxApi } from './inboxes'
import { createPools } from './pools'
import { createProfiles, parseSpotifyUser } from './profiles'
import { createSessions } from './sessions'
import type { PlaylistEntry, SpotifyApi, SpotifyTrack } from './spotify/api'
import { INBOX_SCOPES } from './spotify/oauth'

const ID = (n: number) => `${'t'.repeat(20)}${String(n).padStart(2, '0')}`
const PLAYLIST = 'p'.repeat(22)
const spotifyTrack = (n: number): SpotifyTrack => ({
    id: ID(n),
    title: `Track ${n}`,
    artists: ['Band'],
    album: 'Album',
    coverUrl: null,
    durationMs: 1000
})
const entry = (n: number, addedBy: string, minute = n): PlaylistEntry => ({
    track: spotifyTrack(n),
    addedBy,
    addedAt: new Date(Date.UTC(2026, 10, 20, 11, minute))
})

let db: Database
let now: Date
/** What the fake playlist holds, and its version. */
let playlist: { snapshot: string; items: PlaylistEntry[] } | null
let api: { [K in keyof InboxApi]: ReturnType<typeof vi.fn> }
let inboxes: ReturnType<typeof createInboxes>
let profiles: ReturnType<typeof createProfiles>
let pools: ReturnType<typeof createPools>
let sessions: ReturnType<typeof createSessions>

async function addHost(id: string, scope = INBOX_SCOPES.join(' ')) {
    await db.insert(spotifyAccount).values({
        id,
        refreshToken: 'x',
        scope,
        authorizedAt: now,
        createdAt: now
    })
}

/** Changes the fake playlist like someone in the Spotify app. */
function setItems(items: PlaylistEntry[]) {
    playlist = { snapshot: `v${Number(playlist?.snapshot.slice(1) ?? 0) + 1}`, items }
}

const poolOf = async (profileId: string) =>
    (await pools.list(profileId)).map((item) => item.track.id)

beforeEach(async () => {
    db = openDatabase('file::memory:')
    await migrateDatabase(db)
    now = new Date('2026-11-20T12:00:00Z')
    playlist = null
    api = {
        createPlaylist: vi.fn(async () => {
            setItems([])
            return PLAYLIST
        }),
        playlistSnapshot: vi.fn(async () => playlist?.snapshot ?? null),
        playlistItems: vi.fn(async (_account: string, _id: string, offset: number) => {
            if (!playlist) return null
            const items = playlist.items.slice(offset, offset + 2)
            return { items, next: offset + 2 < playlist.items.length ? offset + 2 : null }
        }),
        removeFromPlaylist: vi.fn(async (_account: string, _id: string, ids: string[]) => {
            setItems(playlist!.items.filter((item) => !ids.includes(item.track.id)))
            return playlist!.snapshot
        })
    }
    const catalog = createCatalog({ db, api: {} as SpotifyApi, now: () => now })
    inboxes = createInboxes({ db, api: api as unknown as InboxApi, catalog, now: () => now })
    profiles = createProfiles({ db, now: () => now })
    pools = createPools({ db, now: () => now })
    sessions = createSessions({ db, now: () => now })
    await addHost('host')
})

const playlistInfo = { name: 'Inbox', description: 'Add tracks' }

describe('inboxes', () => {
    it('creates one lasting inbox per host and one per session', async () => {
        const lasting = await inboxes.create('host', null, playlistInfo)
        expect(await inboxes.create('host', null, playlistInfo)).toEqual(lasting)
        expect(api.createPlaylist).toHaveBeenCalledTimes(1)
        expect(lasting.spotifyUrl).toBe(`https://open.spotify.com/playlist/${PLAYLIST}`)
        expect(await inboxes.lasting('host')).toEqual(lasting)

        const session = await sessions.start('host')
        api.createPlaylist.mockResolvedValueOnce('q'.repeat(22))
        const own = await inboxes.create('host', session.id, playlistInfo)
        expect(own.sessionId).toBe(session.id)
        expect(await inboxes.forSession(session.id)).toEqual(own)
        expect(await inboxes.lasting('host')).toEqual(lasting)
    })

    /** A participant linked to a Spotify user and in the host's open session. */
    async function member(name: string, spotifyUserId: string) {
        const { profile } = await profiles.create(name)
        expect(await profiles.linkSpotify(profile.id, spotifyUserId)).toBe(true)
        const session = await sessions.openOfHost('host')
        await sessions.join(session!.id, profile.id)
        return profile
    }

    it('imports tracks of linked people into their pools, once, and the others when they link', async () => {
        await inboxes.create('host', null, playlistInfo)
        const session = await sessions.start('host')
        const ana = await member('Ana', 'ana.spotify')
        const { profile: ben } = await profiles.create('Ben')
        await sessions.join(session.id, ben.id)
        setItems([entry(1, 'ana.spotify'), entry(2, 'ben_spotify'), entry(3, 'ana.spotify')])

        const result = await inboxes.syncOpen()
        expect([...result.profiles]).toEqual([ana.id])
        expect(await poolOf(ana.id)).toEqual([ID(3), ID(1)])
        expect((await inboxes.lasting('host'))?.tracks).toBe(3)

        // Taken out of the pool, it does not come back while it stays in the playlist
        await pools.remove(ana.id, ID(3))
        setItems([...playlist!.items, entry(4, 'ana.spotify')])
        await inboxes.syncOpen()
        expect(await poolOf(ana.id)).toEqual([ID(4), ID(1)])

        // Unchanged playlists are not read again
        api.playlistItems.mockClear()
        await inboxes.syncOpen()
        expect(api.playlistItems).not.toHaveBeenCalled()

        // Ben links later and gets what he added before
        expect(await profiles.linkSpotify(ben.id, 'ben_spotify')).toBe(true)
        expect(await inboxes.importFor('ben_spotify')).toEqual([ben.id])
        expect(await poolOf(ben.id)).toEqual([ID(2)])
    })

    it("imports only into profiles in an open session of the inbox's host", async () => {
        await inboxes.create('host', null, playlistInfo)
        const session = await sessions.start('host')
        await addHost('other')
        const other = await sessions.start('other')
        const { profile: eve } = await profiles.create('Eve')
        await profiles.linkSpotify(eve.id, 'ana')
        // In another host's session only: the claim opens nothing of this host's inbox
        await sessions.join(other.id, eve.id)
        setItems([entry(1, 'ana')])
        await inboxes.syncOpen()
        expect(await inboxes.importFor('ana')).toEqual([])
        expect(await poolOf(eve.id)).toEqual([])
        // Joined, the next look imports
        await sessions.join(session.id, eve.id)
        await inboxes.syncOpen()
        expect(await poolOf(eve.id)).toEqual([ID(1)])
    })

    it('lets a sign-in take a Spotify user from a link, but not from another live sign-in', async () => {
        const { profile: ana } = await profiles.create('Ana')
        const { profile: ben } = await profiles.create('Ben')
        const { profile: cem } = await profiles.create('Cem')
        const day = 24 * 60 * 60 * 1000
        const later = (days: number) => new Date(now.getTime() + days * day)
        expect(await profiles.linkSpotify(ana.id, 'someone')).toBe(true)
        expect(await profiles.linkSpotify(ana.id, 'someone')).toBe(true)
        expect(await profiles.linkSpotify(ben.id, 'someone')).toBe(false)
        expect(await profiles.claimSpotify(ben.id, 'someone', later(30))).toBe(true)
        // The host's other device
        expect(await profiles.claimSpotify(cem.id, 'someone', later(30))).toBe(false)
        const linked = async () =>
            Object.fromEntries(
                (await db.query.profile.findMany()).map((row) => [
                    row.name,
                    row.spotifyUserId &&
                        `${row.spotifyUserId} ${row.spotifyVerifiedUntil?.getTime() ?? '-'}`
                ])
            )
        expect(await linked()).toEqual({
            Ana: null,
            Ben: `someone ${later(30).getTime()}`,
            Cem: null
        })
        // A later sign-in extends it, an earlier one does not shorten it
        await profiles.claimSpotify(ben.id, 'someone', later(40))
        await profiles.claimSpotify(ben.id, 'someone', later(35))
        expect((await linked()).Ben).toBe(`someone ${later(40).getTime()}`)

        // Signing out there lets it go
        await profiles.releaseSpotify(ben.id, 'someone')
        expect(await profiles.claimSpotify(cem.id, 'someone', later(30))).toBe(true)
        expect(await linked()).toEqual({
            Ana: null,
            Ben: null,
            Cem: `someone ${later(30).getTime()}`
        })

        // Once Cem's sign-in expired, another sign-in takes it
        now = later(31)
        expect(await profiles.claimSpotify(ben.id, 'someone', later(30))).toBe(true)

        // Pasting a link is never vouched for, also on a profile a sign-in linked
        expect(await profiles.linkSpotify(ben.id, 'victim')).toBe(true)
        expect((await linked()).Ben).toBe('victim -')
        expect(await profiles.claimSpotify(cem.id, 'victim', later(30))).toBe(true)

        // Deleting the account frees what sign-ins linked
        await profiles.releaseAccount('victim')
        expect((await linked()).Cem).toBeNull()
    })

    it('makes a track added again the newest of a pool', async () => {
        await inboxes.create('host', null, playlistInfo)
        await sessions.start('host')
        const ana = await member('Ana', 'ana')
        setItems([entry(1, 'ana', 10), entry(2, 'ana', 20)])
        await inboxes.syncOpen()
        expect(await poolOf(ana.id)).toEqual([ID(2), ID(1)])
        // Removed and added again in Spotify: imported again, as the newest
        setItems([entry(2, 'ana', 20)])
        await inboxes.syncOpen()
        setItems([entry(2, 'ana', 20), entry(1, 'ana', 50)])
        await inboxes.syncOpen()
        expect(await poolOf(ana.id)).toEqual([ID(1), ID(2)])
    })

    it("removes tracks beyond the pool limit of the host's open session, and only those", async () => {
        await inboxes.create('host', null, playlistInfo)
        const session = await sessions.start('host')
        const ana = await member('Ana', 'ana')
        await member('Ben', 'ben')
        setItems([
            entry(1, 'ana', 1),
            entry(2, 'ana', 2),
            entry(3, 'ana', 3),
            // Ben's copy of track 1 is the newest in his pool: track 1 stays
            entry(1, 'ben', 4),
            entry(5, 'stranger', 0),
            // Nobody knows who added this copy of track 6: it stays
            entry(6, 'ana', 0),
            { ...entry(6, 'ana', 0), addedBy: null }
        ])
        await inboxes.syncOpen()
        expect(api.removeFromPlaylist).not.toHaveBeenCalled()

        await sessions.updateSettings(session.id, { ...session, maxPoolSize: 1 })
        await inboxes.syncOpen()
        expect(api.removeFromPlaylist).toHaveBeenCalledWith('host', PLAYLIST, [ID(2)])
        expect(playlist!.items.map((item) => item.track.id)).toEqual([
            ID(1),
            ID(3),
            ID(1),
            ID(5),
            ID(6),
            ID(6)
        ])
        // They stay in the pool
        expect(await poolOf(ana.id)).toEqual([ID(3), ID(2), ID(1), ID(6)])

        // Read again, nothing more to remove
        api.removeFromPlaylist.mockClear()
        await inboxes.syncOpen()
        expect(api.removeFromPlaylist).not.toHaveBeenCalled()
    })

    it('removes nothing of a profile the link moved away from, nor tracks out of the pool', async () => {
        await inboxes.create('host', null, playlistInfo)
        const session = await sessions.start('host')
        const ana = await member('Ana', 'ana')
        setItems([entry(1, 'ana', 1), entry(2, 'ana', 2), entry(3, 'ana', 3)])
        await inboxes.syncOpen()
        await sessions.updateSettings(session.id, { ...session, maxPoolSize: 2 })

        // Taken out of the pool: stays in the playlist
        await pools.remove(ana.id, ID(1))
        await inboxes.syncOpen()
        expect(api.removeFromPlaylist).not.toHaveBeenCalled()

        // Someone else claims the Spotify user: Ana's copies are in no window of theirs, and stay
        await profiles.unlinkSpotify(ana.id)
        const eve = await member('Eve', 'ana')
        await inboxes.syncOpen()
        expect(api.removeFromPlaylist).not.toHaveBeenCalled()
        expect(await poolOf(eve.id)).toEqual([])
    })

    it('removes nothing when the playlist changed since it was read', async () => {
        await inboxes.create('host', null, playlistInfo)
        const session = await sessions.start('host')
        await member('Ana', 'ana')
        setItems([entry(1, 'ana', 1), entry(2, 'ana', 2)])
        await inboxes.syncOpen()
        await sessions.updateSettings(session.id, { ...session, maxPoolSize: 1 })
        // Someone adds a copy of track 1 between the look and the removal
        const snapshot = playlist!.snapshot
        api.playlistSnapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce('moved')
        await inboxes.syncOpen()
        expect(api.removeFromPlaylist).not.toHaveBeenCalled()
        // The next look finds it unchanged and removes
        await inboxes.syncOpen()
        expect(api.removeFromPlaylist).toHaveBeenCalledWith('host', PLAYLIST, [ID(1)])
    })

    it('reads a bounded number of items and leaves a playlist read in part alone', async () => {
        await inboxes.create('host', null, playlistInfo)
        const session = await sessions.start('host')
        await member('Ana', 'ana')
        await sessions.updateSettings(session.id, { ...session, maxPoolSize: 1 })
        setItems(
            Array.from({ length: 30 }, (_, i) => entry(i + 1, 'ana', i)).concat(
                Array.from({ length: 600 }, () => entry(99, 'ana', 0))
            )
        )
        api.playlistItems.mockClear()
        await inboxes.syncOpen()
        // Two items a page in the fake: offsets 0 to 498
        expect(api.playlistItems).toHaveBeenCalledTimes(250)
        expect(api.removeFromPlaylist).not.toHaveBeenCalled()
    })

    it('looks only at inboxes of hosts with an open session and the scopes', async () => {
        await inboxes.create('host', null, playlistInfo)
        await inboxes.syncOpen()
        expect(api.playlistSnapshot).not.toHaveBeenCalled()

        await addHost('other', '')
        await db.update(spotifyAccount).set({ scope: '' })
        await sessions.start('host')
        await inboxes.syncOpen()
        expect(api.playlistSnapshot).not.toHaveBeenCalled()
    })

    it('forgets an inbox whose playlist stays gone, and an ended session stops its own', async () => {
        const session = await sessions.start('host')
        await inboxes.create('host', session.id, playlistInfo)
        api.playlistSnapshot.mockResolvedValue(null)
        for (let i = 1; i < INBOX_MISSES; i++) {
            expect([...(await inboxes.syncOpen()).sessions]).toEqual([])
            expect(await inboxes.forSession(session.id)).not.toBeNull()
        }
        expect([...(await inboxes.syncOpen()).sessions]).toEqual([session.id])
        expect(await inboxes.forSession(session.id)).toBeNull()

        await inboxes.create('host', session.id, playlistInfo)
        await sessions.end(session.id)
        api.playlistSnapshot.mockClear()
        await inboxes.syncOpen()
        expect(api.playlistSnapshot).not.toHaveBeenCalled()
    })

    it('stores only invitation links to the inbox itself', async () => {
        const inbox = await inboxes.create('host', null, playlistInfo)
        const invite = `https://open.spotify.com/playlist/${PLAYLIST}?si=abc&pt=def`
        expect(await inboxes.setInvite('other', inbox.id, invite)).toBe(false)
        expect(await inboxes.setInvite('host', inbox.id, 'https://example.com/')).toBe(false)
        expect(await inboxes.setInvite('host', inbox.id, invite)).toBe(true)
        expect((await inboxes.lasting('host'))?.inviteUrl).toBe(invite)
        expect(await inboxes.setInvite('host', inbox.id, '')).toBe(true)
        expect((await inboxes.lasting('host'))?.inviteUrl).toBeNull()
    })
})

describe('parseInviteUrl', () => {
    it('takes links to the playlist and short links of the Spotify app', () => {
        expect(
            parseInviteUrl(` https://open.spotify.com/intl-de/playlist/${PLAYLIST}?pt=x `, PLAYLIST)
        ).toBe(`https://open.spotify.com/intl-de/playlist/${PLAYLIST}?pt=x`)
        expect(parseInviteUrl('https://spotify.link/AbC123', PLAYLIST)).toBe(
            'https://spotify.link/AbC123'
        )
        expect(
            parseInviteUrl(`https://open.spotify.com/playlist/${'x'.repeat(22)}`, PLAYLIST)
        ).toBeNull()
        expect(parseInviteUrl(`http://open.spotify.com/playlist/${PLAYLIST}`, PLAYLIST)).toBeNull()
        expect(
            parseInviteUrl(`https://open.spotify.com.example.com/playlist/${PLAYLIST}`, PLAYLIST)
        ).toBeNull()
        expect(parseInviteUrl('javascript:alert(1)', PLAYLIST)).toBeNull()
    })
})

describe('parseSpotifyUser', () => {
    it('takes profile links and URIs', () => {
        expect(parseSpotifyUser('https://open.spotify.com/user/abc.def?si=123')).toBe('abc.def')
        expect(parseSpotifyUser('https://open.spotify.com/intl-de/user/31abcxyz')).toBe('31abcxyz')
        expect(parseSpotifyUser('spotify:user:someone')).toBe('someone')
        expect(parseSpotifyUser('https://open.spotify.com/user/a%20b')).toBeNull()
        expect(parseSpotifyUser('https://example.com/user/abc')).toBeNull()
        expect(parseSpotifyUser('someone')).toBeNull()
    })
})
