import { and, eq, isNull } from 'drizzle-orm'
import { trackView, type TrackView } from './catalog'
import type { Database } from './db/open'
import { play, profile, track, type Playback, type Session } from './db/schema'
import type { Live, PlayerProblem } from './engine'
import type { Picker } from './picker'

/** A track of the session, with whose turn it is. */
export interface SessionTrack {
    track: TrackView
    /** The name of whoever it plays for; null in an anonymous session (or when it is one's own). */
    by: string | null
    /** Whether it plays for the one looking. */
    mine: boolean
}

/** What a session's page shows of its music. */
export interface PlayingView {
    playback: Playback
    problem: PlayerProblem | null
    /** The device the playing account plays on. */
    device: string | null
    /** The session's track that plays, with where it was when the page loaded. */
    current: (SessionTrack & { progressMs: number; durationMs: number; isPlaying: boolean }) | null
    /** Spotify plays something that is not from the session (after the queue ran dry, or a pause). */
    elsewhere: boolean
    /** The track that comes next: queued in Spotify already, or the one it would be now. */
    next: (SessionTrack & { queued: boolean }) | null
}

export function createPlayingView({
    db,
    picker,
    live,
    now = () => new Date()
}: {
    db: Database
    picker: Picker
    live: (sessionId: string) => Live | null
    now?: () => Date
}) {
    async function describe(
        session: Session,
        trackId: string,
        profileId: string | null,
        viewerId: string | null
    ): Promise<SessionTrack | null> {
        const [row] = await db
            .select({ track, name: profile.name })
            .from(track)
            .leftJoin(profile, profileId ? eq(profile.id, profileId) : isNull(profile.id))
            .where(eq(track.id, trackId))
            .limit(1)
        if (!row) return null
        const mine = profileId !== null && profileId === viewerId
        return {
            track: trackView(row.track),
            by: session.anonymous || mine ? null : (row.name ?? null),
            mine
        }
    }

    return {
        /** The session's music as the profile `viewerId` (or a visitor without one) sees it. */
        async view(session: Session, viewerId: string | null): Promise<PlayingView> {
            const rows = await db
                .select()
                .from(play)
                .where(and(eq(play.sessionId, session.id), isNull(play.endedAt)))
            const currentPlay = rows.find((row) => row.startedAt)
            const queuedPlay = rows.find((row) => !row.startedAt)
            const state = session.playback === 'playing' ? live(session.id) : null

            let current: PlayingView['current'] = null
            if (currentPlay) {
                const described = await describe(
                    session,
                    currentPlay.trackId,
                    currentPlay.profileId,
                    viewerId
                )
                const known = state?.trackId === currentPlay.trackId
                const durationMs = known ? state.durationMs : 0
                const progressMs = known
                    ? Math.min(
                          durationMs,
                          state.progressMs +
                              (state.isPlaying ? now().getTime() - state.at.getTime() : 0)
                      )
                    : 0
                if (described)
                    current = {
                        ...described,
                        progressMs,
                        durationMs,
                        isPlaying: known && state.isPlaying
                    }
            }

            let next: PlayingView['next'] = null
            const upcoming = queuedPlay ?? (await picker.next(session))
            if (upcoming) {
                const described = await describe(
                    session,
                    upcoming.trackId,
                    upcoming.profileId,
                    viewerId
                )
                if (described) next = { ...described, queued: queuedPlay !== undefined }
            }

            return {
                playback: session.playback,
                problem: state?.problem ?? null,
                device: state?.device ?? null,
                current,
                elsewhere:
                    !current &&
                    state !== null &&
                    !state.problem &&
                    state.isPlaying &&
                    state.trackId !== queuedPlay?.trackId,
                next
            }
        }
    }
}

export type PlayingViews = ReturnType<typeof createPlayingView>
