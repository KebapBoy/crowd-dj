import { and, desc, eq } from 'drizzle-orm'
import { trackView, type TrackView } from './catalog'
import type { Database } from './db/open'
import { poolItem, track } from './db/schema'

export interface PoolEntry {
    track: TrackView
    addedAt: Date
}

export function createPools({ db, now = () => new Date() }: { db: Database; now?: () => Date }) {
    return {
        /**
         * Adds cached tracks to a profile's pool. A track already in it counts as added again, so it is
         * among the newest that a session's pool limit counts. Of several tracks added at once (a
         * pasted playlist), the first counts as the newest.
         */
        async add(profileId: string, trackIds: string[]) {
            if (trackIds.length === 0) return
            const at = now().getTime()
            const rows = trackIds.map((trackId, i) => ({
                profileId,
                trackId,
                addedAt: new Date(at - i)
            }))
            for (const row of rows)
                await db
                    .insert(poolItem)
                    .values(row)
                    .onConflictDoUpdate({
                        target: [poolItem.profileId, poolItem.trackId],
                        set: { addedAt: row.addedAt }
                    })
        },

        async remove(profileId: string, trackId: string) {
            await db
                .delete(poolItem)
                .where(and(eq(poolItem.profileId, profileId), eq(poolItem.trackId, trackId)))
        },

        /** The profile's pool, newest first. */
        async list(profileId: string): Promise<PoolEntry[]> {
            const rows = await db
                .select({ track, addedAt: poolItem.addedAt })
                .from(poolItem)
                .innerJoin(track, eq(track.id, poolItem.trackId))
                .where(eq(poolItem.profileId, profileId))
                .orderBy(desc(poolItem.addedAt))
            return rows.map((row) => ({ track: trackView(row.track), addedAt: row.addedAt }))
        }
    }
}

export type Pools = ReturnType<typeof createPools>
