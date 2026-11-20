import { createHash } from 'node:crypto'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { Database } from './db/open'
import { play, poolItem, sessionMember, wish, type Session } from './db/schema'

/** The track that plays next, and for whom. */
export interface NextTrack {
    profileId: string
    trackId: string
    /** The wish it fulfils; null for a track from the pool. */
    wishId: string | null
}

/**
 * A stable random order: the same pool gives the same pick until a track plays or the pool
 * changes, so "up next" does not jump around on every reload.
 */
function rank(seed: string, trackId: string) {
    return createHash('sha256').update(`${seed}\n${trackId}`).digest('hex')
}

export function createPicker({ db }: { db: Database }) {
    return {
        /**
         * The next track by the session's mode, in turns per person: whoever has waited longest for
         * a track of theirs comes first, newcomers in the order they joined. Everyone who joined
         * counts until they leave. Open wishes go before pools (or alone, or not at all, by mode);
         * a pool gives a random track of its newest ones within the session's pool limit. No track
         * plays twice in a session, and a wished track is not taken from a pool.
         */
        async next(session: Session): Promise<NextTrack | null> {
            const members = await db
                .select({ profileId: sessionMember.profileId })
                .from(sessionMember)
                .where(and(eq(sessionMember.sessionId, session.id), isNull(sessionMember.leftAt)))
                .orderBy(asc(sessionMember.joinedAt), asc(sessionMember.profileId))
            if (members.length === 0) return null
            const plays = await db
                .select({ trackId: play.trackId, profileId: play.profileId, at: play.queuedAt })
                .from(play)
                .where(eq(play.sessionId, session.id))
            const played = new Set(plays.map((row) => row.trackId))
            const lastTurn = new Map<string, number>()
            for (const row of plays)
                if (row.profileId)
                    lastTurn.set(
                        row.profileId,
                        Math.max(lastTurn.get(row.profileId) ?? 0, row.at.getTime())
                    )
            // Stable sort: equal turns keep the order of joining
            const order = members
                .map((member) => member.profileId)
                .sort((a, b) => (lastTurn.get(a) ?? -1) - (lastTurn.get(b) ?? -1))

            const wishes = await db
                .select({
                    id: wish.id,
                    profileId: wish.profileId,
                    trackId: wish.trackId,
                    playedAt: wish.playedAt
                })
                .from(wish)
                .where(eq(wish.sessionId, session.id))
                .orderBy(asc(wish.createdAt))
            if (session.mode !== 'pool_only') {
                for (const profileId of order) {
                    const open = wishes.find(
                        (row) =>
                            row.profileId === profileId && !row.playedAt && !played.has(row.trackId)
                    )
                    if (open) return { profileId, trackId: open.trackId, wishId: open.id }
                }
                if (session.mode === 'wishes_only') return null
            }

            const wished = new Set(wishes.map((row) => row.trackId))
            for (const profileId of order) {
                const pool = await db
                    .select({ trackId: poolItem.trackId })
                    .from(poolItem)
                    .where(eq(poolItem.profileId, profileId))
                    .orderBy(desc(poolItem.addedAt))
                    .limit(session.maxPoolSize ?? -1)
                const candidates = pool
                    .map((row) => row.trackId)
                    .filter((trackId) => !played.has(trackId) && !wished.has(trackId))
                if (candidates.length === 0) continue
                const seed = `${session.id}\n${profileId}\n${plays.length}`
                const ranked = candidates.map((trackId) => ({ trackId, rank: rank(seed, trackId) }))
                ranked.sort((a, b) => (a.rank < b.rank ? -1 : 1))
                return { profileId, trackId: ranked[0].trackId, wishId: null }
            }
            return null
        }
    }
}

export type Picker = ReturnType<typeof createPicker>
