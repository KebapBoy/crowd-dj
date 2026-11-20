import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Database } from './db/open'
import { play, sessionMember, skipVote, type Play, type Session } from './db/schema'

/**
 * Why a participant cannot vote on the track that plays: it plays for them and they skip it
 * directly (`own`), they joined after it started (`late`), or they have not added anything yet
 * (`contribute`). The last two keep profiles made just to vote from counting.
 */
export type VoteBlock = 'own' | 'late' | 'contribute'

/** Skip votes on the track that plays, as a page shows them. */
export interface VoteTally {
    count: number
    /** Votes it takes to skip (see `createSkips`). */
    needed: number
    /** Whether the one looking has voted. */
    mine: boolean
    /** Why the one looking cannot vote on it; null when they can. */
    blocked: VoteBlock | null
}

/** What a vote gave: `gone` when the track no longer plays. */
export type VoteResult = 'ok' | 'gone' | VoteBlock | 'member'

/**
 * Who may skip the track that plays, and the votes to skip it. Votes belong to a play, so they
 * count only while that track plays. Who can vote: the participants in the session (not left) who
 * were in it when the track started and have added something (a wish in the session, a track in
 * their pool), except the one it plays for when the session lets them skip it directly (the host
 * skips directly too; their pages are not a participant's). Profiles are free to make, so this
 * keeps ones made in a hurry to vote a track away from counting. It takes at least the session's
 * minimum of votes and its share of those who are there: who can vote and has the session open
 * (`present`) or voted. Never more than there are people to vote, and at least one.
 */
export function createSkips({
    db,
    present,
    now = () => new Date()
}: {
    db: Database
    /** Profiles with the session's page open. */
    present: (sessionId: string) => Set<string>
    now?: () => Date
}) {
    /** The session's track that plays, when it is `playId`. */
    async function current(sessionId: string, playId: string): Promise<Play | null> {
        const row = await db.query.play.findFirst({
            where: and(
                eq(play.id, playId),
                eq(play.sessionId, sessionId),
                isNotNull(play.startedAt),
                isNull(play.endedAt)
            )
        })
        return row ?? null
    }

    /**
     * Why each participant in the session (not left) cannot vote on the play, or null when they
     * can; profiles that are not in the session are missing.
     */
    async function blocks(session: Session, row: Play): Promise<Map<string, VoteBlock | null>> {
        const members = await db
            .select({
                id: sessionMember.profileId,
                joinedAt: sessionMember.joinedAt,
                // Columns spelled out: Drizzle would leave out the table, which the subqueries'
                // own tables would then shadow
                contributed: sql<number>`exists (select 1 from wish
                        where wish.session_id = ${session.id}
                            and wish.profile_id = session_member.profile_id)
                    or exists (select 1 from pool_item
                        where pool_item.profile_id = session_member.profile_id)`
            })
            .from(sessionMember)
            .where(and(eq(sessionMember.sessionId, session.id), isNull(sessionMember.leftAt)))
        return new Map(
            members.map((member) => {
                let block: VoteBlock | null = null
                if (session.skipOwn && row.profileId === member.id) block = 'own'
                else if (row.startedAt && member.joinedAt > row.startedAt) block = 'late'
                else if (!member.contributed) block = 'contribute'
                return [member.id, block]
            })
        )
    }

    async function tally(
        session: Session,
        row: Play,
        viewerId: string | null = null
    ): Promise<VoteTally> {
        const blocked = await blocks(session, row)
        const canVote = (id: string) => blocked.get(id) === null
        const voters = (
            await db
                .select({ id: skipVote.profileId })
                .from(skipVote)
                .where(eq(skipVote.playId, row.id))
        )
            .map((vote) => vote.id)
            .filter(canVote)
        const there = new Set([...present(session.id)].filter(canVote).concat(voters)).size
        const share = Math.ceil((session.skipPercent * there) / 100)
        return {
            count: voters.length,
            needed: Math.max(1, Math.min(there, Math.max(session.skipVotes, share))),
            mine: viewerId !== null && voters.includes(viewerId),
            blocked: (viewerId !== null && blocked.get(viewerId)) || null
        }
    }

    return {
        current,
        tally,

        /** Whether skip voting is on and the votes on the track that plays reached what it takes. */
        async reached(session: Session, playId: string): Promise<boolean> {
            if (!session.skipVoting) return false
            const row = await current(session.id, playId)
            if (!row) return false
            const { count, needed } = await tally(session, row)
            return count >= needed
        },

        /** Votes to skip the track that plays (`on`), or takes the vote back. */
        async vote(
            session: Session,
            playId: string,
            profileId: string,
            on: boolean
        ): Promise<VoteResult> {
            const row = await current(session.id, playId)
            if (!row) return 'gone'
            const block = (await blocks(session, row)).get(profileId)
            if (block === undefined) return 'member'
            // Taking a vote back always works
            if (on && block) return block
            if (on)
                await db
                    .insert(skipVote)
                    .values({ playId, profileId, createdAt: now() })
                    .onConflictDoNothing()
            else
                await db
                    .delete(skipVote)
                    .where(and(eq(skipVote.playId, playId), eq(skipVote.profileId, profileId)))
            return 'ok'
        }
    }
}

export type Skips = ReturnType<typeof createSkips>
