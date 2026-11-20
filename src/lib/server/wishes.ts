import { and, asc, count, eq, isNull, sql } from 'drizzle-orm'
import { trackView, type TrackView } from './catalog'
import { randomId } from './crypto'
import type { Database } from './db/open'
import { track, wish, type Session } from './db/schema'

/** Why a wish was not taken. */
export type WishProblem = 'mode' | 'openLimit' | 'sessionLimit' | 'taken'

export interface WishView {
    id: string
    track: TrackView
    createdAt: Date
    playedAt: Date | null
}

/** A profile's wishes in a session, against the session's limits. */
export interface WishCounts {
    open: number
    total: number
}

export function createWishes({ db, now = () => new Date() }: { db: Database; now?: () => Date }) {
    const ofProfile = (sessionId: string, profileId: string) =>
        and(eq(wish.sessionId, sessionId), eq(wish.profileId, profileId))

    async function counts(sessionId: string, profileId: string): Promise<WishCounts> {
        const [row] = await db
            .select({
                total: count(),
                // count() skips nulls, and the case is null for played wishes
                open: count(sql`case when ${wish.playedAt} is null then 1 end`)
            })
            .from(wish)
            .where(ofProfile(sessionId, profileId))
        return row
    }

    return {
        /**
         * Wishes a cached track in a session, within the session's limits: open wishes at a time and
         * wishes in the session per person. Each track can be wished once per session.
         */
        async add(
            session: Session,
            profileId: string,
            trackId: string
        ): Promise<WishProblem | null> {
            if (session.mode === 'pool_only') return 'mode'
            const mine = sql`session_id = ${session.id} and profile_id = ${profileId}`
            // Counting and inserting in one statement, so two quick wishes cannot both slip under a
            // limit (a transaction would hold the database's only connection across awaits)
            const result = await db.run(sql`
                insert into wish (id, session_id, profile_id, track_id, created_at)
                select ${randomId()}, ${session.id}, ${profileId}, ${trackId}, ${now().getTime()}
                where (${session.maxOpenWishes} is null
                        or (select count(*) from wish where ${mine} and played_at is null)
                            < ${session.maxOpenWishes})
                    and (${session.maxSessionWishes} is null
                        or (select count(*) from wish where ${mine}) < ${session.maxSessionWishes})
                on conflict do nothing`)
            if (result.rowsAffected > 0) return null
            // Not inserted: a limit was reached, or the track has been wished already
            const { open, total } = await counts(session.id, profileId)
            if (session.maxOpenWishes !== null && open >= session.maxOpenWishes) return 'openLimit'
            if (session.maxSessionWishes !== null && total >= session.maxSessionWishes)
                return 'sessionLimit'
            return 'taken'
        },

        /**
         * Takes back an open wish of the profile; it no longer counts against the limits. False when
         * there was none (played meanwhile).
         */
        async withdraw(sessionId: string, profileId: string, wishId: string): Promise<boolean> {
            const result = await db
                .delete(wish)
                .where(
                    and(ofProfile(sessionId, profileId), eq(wish.id, wishId), isNull(wish.playedAt))
                )
            return result.rowsAffected > 0
        },

        counts(sessionId: string, profileId: string) {
            return counts(sessionId, profileId)
        },

        /** The profile's wishes in the session, in the order they were made. */
        async list(sessionId: string, profileId: string): Promise<WishView[]> {
            const rows = await db
                .select({ wish, track })
                .from(wish)
                .innerJoin(track, eq(track.id, wish.trackId))
                .where(ofProfile(sessionId, profileId))
                .orderBy(asc(wish.createdAt))
            return rows.map((row) => ({
                id: row.wish.id,
                track: trackView(row.track),
                createdAt: row.wish.createdAt,
                playedAt: row.wish.playedAt
            }))
        }
    }
}

export type Wishes = ReturnType<typeof createWishes>
