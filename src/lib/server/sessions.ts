import { and, asc, eq, isNull, lt } from 'drizzle-orm'
import { randomId } from './crypto'
import type { Database } from './db/open'
import { profile, session, sessionMember, type Session, type SessionMode } from './db/schema'

/** A session without a sign of life for this long ends by itself. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000
/** Visits closer together than this do not write the session's activity again. */
const TOUCH_INTERVAL_MS = 60 * 1000

export const SESSION_MODES: readonly SessionMode[] = ['wishes_first', 'pool_only', 'wishes_only']

/** What the host sets per session. */
export type SessionSettings = Pick<
    Session,
    | 'mode'
    | 'anonymous'
    | 'maxOpenWishes'
    | 'maxSessionWishes'
    | 'maxPoolSize'
    | 'skipOwn'
    | 'skipVoting'
    | 'skipVotes'
    | 'skipPercent'
>

/** Settings as the form sends them: the vote thresholds only while skip voting is on. */
export type SettingsUpdate = Omit<SessionSettings, 'skipVotes' | 'skipPercent'> &
    Partial<Pick<SessionSettings, 'skipVotes' | 'skipPercent'>>

/** A setting the form sent with a value that is not allowed. */
export type SettingsProblem = 'mode' | 'limit' | 'skipVotes' | 'skipPercent'

/** Largest value of a limit (wishes, pool size) or of the votes needed to skip. */
export const LIMIT_MAX = 999

function integerIn(value: FormDataEntryValue | null, min: number, max: number): number | null {
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null
    const number = Number(value)
    return number >= min && number <= max ? number : null
}

/** An optional limit: empty means none. Undefined when the value is not allowed. */
function limit(value: FormDataEntryValue | null): number | null | undefined {
    if (value === null || (typeof value === 'string' && value.trim() === '')) return null
    return integerIn(value, 1, LIMIT_MAX) ?? undefined
}

/** Reads the settings form of a session (checkboxes are on when present). */
export function parseSettings(
    form: FormData
): { settings: SettingsUpdate } | { problem: SettingsProblem } {
    const mode = form.get('mode')
    if (!SESSION_MODES.includes(mode as SessionMode)) return { problem: 'mode' }
    const limits = [
        form.get('maxOpenWishes'),
        form.get('maxSessionWishes'),
        form.get('maxPoolSize')
    ]
    const [maxOpenWishes, maxSessionWishes, maxPoolSize] = limits.map(limit)
    if (maxOpenWishes === undefined || maxSessionWishes === undefined || maxPoolSize === undefined)
        return { problem: 'limit' }
    const skipVoting = form.has('skipVoting')
    const skipVotes = integerIn(form.get('skipVotes'), 1, LIMIT_MAX)
    const skipPercent = integerIn(form.get('skipPercent'), 1, 100)
    // The vote thresholds only count while voting is on; keep the stored ones otherwise
    if (skipVoting && skipVotes === null) return { problem: 'skipVotes' }
    if (skipVoting && skipPercent === null) return { problem: 'skipPercent' }
    return {
        settings: {
            mode: mode as SessionMode,
            anonymous: form.has('anonymous'),
            maxOpenWishes,
            maxSessionWishes,
            maxPoolSize,
            skipOwn: form.has('skipOwn'),
            skipVoting,
            ...(skipVotes !== null && { skipVotes }),
            ...(skipPercent !== null && { skipPercent })
        }
    }
}

export function createSessions({ db, now = () => new Date() }: { db: Database; now?: () => Date }) {
    const idleSince = () => new Date(now().getTime() - IDLE_LIMIT_MS)

    const open = (sessionId: string) => and(eq(session.id, sessionId), isNull(session.endedAt))

    /** Open sessions without a sign of life for too long; a visit meanwhile keeps them open. */
    const idle = () => and(isNull(session.endedAt), lt(session.activeAt, idleSince()))

    async function end(sessionId: string, reason: 'host' | 'idle') {
        await db
            .update(session)
            .set({ endedAt: now(), endReason: reason })
            .where(reason === 'idle' ? and(eq(session.id, sessionId), idle()) : open(sessionId))
    }

    /** Ends the open sessions that had no sign of life for too long. */
    async function endIdle() {
        await db.update(session).set({ endedAt: now(), endReason: 'idle' }).where(idle())
    }

    /** The session, ended first if it has been idle for too long. */
    async function get(sessionId: string): Promise<Session | null> {
        const row = await db.query.session.findFirst({ where: eq(session.id, sessionId) })
        if (!row || row.endedAt || row.activeAt >= idleSince()) return row ?? null
        await end(sessionId, 'idle')
        return (await db.query.session.findFirst({ where: eq(session.id, sessionId) })) ?? null
    }

    /** The host's open session; null when it has none or it just ended as idle. */
    async function openOfHost(hostId: string): Promise<Session | null> {
        const row = await db.query.session.findFirst({
            where: and(eq(session.hostId, hostId), isNull(session.endedAt))
        })
        const current = row && (await get(row.id))
        return current && !current.endedAt ? current : null
    }

    return {
        get,
        endIdle,
        openOfHost,

        /** The host's open session, or a new one with the default settings. */
        async start(hostId: string): Promise<Session> {
            const existing = await openOfHost(hostId)
            if (existing) return existing
            const at = now()
            // A concurrent start of the same host loses on the unique index and gets the other one
            const [row] = await db
                .insert(session)
                .values({ id: randomId(), hostId, createdAt: at, activeAt: at })
                .onConflictDoNothing()
                .returning()
            return row ?? (await openOfHost(hostId))!
        },

        /** Records a sign of life, so the session does not end as idle. */
        async touch(sessionId: string) {
            const at = now()
            await db
                .update(session)
                .set({ activeAt: at })
                .where(
                    and(
                        open(sessionId),
                        lt(session.activeAt, new Date(at.getTime() - TOUCH_INTERVAL_MS))
                    )
                )
        },

        async updateSettings(sessionId: string, settings: SettingsUpdate) {
            await db.update(session).set(settings).where(open(sessionId))
        },

        /** Ends the session on the host's request; the join link stops working. */
        async end(sessionId: string) {
            await end(sessionId, 'host')
        },

        async join(sessionId: string, profileId: string) {
            await db
                .insert(sessionMember)
                .values({ sessionId, profileId, joinedAt: now() })
                .onConflictDoNothing()
        },

        /** Everyone who joined, in the order they came. */
        async members(sessionId: string): Promise<{ id: string; name: string }[]> {
            return db
                .select({ id: profile.id, name: profile.name })
                .from(sessionMember)
                .innerJoin(profile, eq(profile.id, sessionMember.profileId))
                .where(eq(sessionMember.sessionId, sessionId))
                .orderBy(asc(sessionMember.joinedAt), asc(profile.name))
        }
    }
}

export type Sessions = ReturnType<typeof createSessions>
