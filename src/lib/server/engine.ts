import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { randomId } from './crypto'
import type { Database } from './db/open'
import { play, spotifyAccount, wish, type Play, type Session } from './db/schema'
import { errorSummary } from './errors'
import type { Events } from './events'
import type { Picker } from './picker'
import type { Sessions } from './sessions'
import type { PlayerDevice, PlayerState, SpotifyApi } from './spotify/api'
import { SpotifyError } from './spotify/oauth'

/** The next track goes to Spotify's queue this long before the current one ends. */
export const QUEUE_AHEAD_MS = 15 * 1000
/** How often the player is asked what it does while a session plays. */
export const POLL_MS = 5 * 1000
export const MIN_DELAY_MS = 1000
/** Something that may change what plays next looks this soon at the latest (see `poke`). */
const POKE_DELAY_MS = 2000
/** Slower while there is no device to play on or Spotify fails: nothing changes quickly then. */
const IDLE_POLL_MS = 10 * 1000
const ERROR_POLL_MS = 30 * 1000
/** A stopped track this close to its end (or at its start) has run out rather than been paused. */
const FINISH_MARGIN_MS = 2000
/** How long Spotify gets to show a track crowd-dj just started before it is started again. */
const START_GRACE_MS = 8000
/** A position this far from where it should be has been moved by hand: tell the pages. */
const SEEK_TOLERANCE_MS = 4000

/** Why the engine cannot play: shown to the host with what to do about it. */
export type PlayerProblem = 'no_device' | 'refused' | 'signin' | 'busy' | 'failed'

/** What the playing account was doing when the engine last asked. */
export interface Live {
    problem: PlayerProblem | null
    device: string | null
    trackId: string | null
    isPlaying: boolean
    progressMs: number
    durationMs: number
    /** When it was asked. */
    at: Date
}

/** What a host's request to play gave. */
export type PlayResult = 'ok' | 'nothing' | PlayerProblem

export type PlayerApi = Pick<
    SpotifyApi,
    'playerState' | 'devices' | 'play' | 'queue' | 'userQueue' | 'transfer' | 'next'
>

interface Memory {
    live: Live | null
    /**
     * Whether the current track came near its end with nothing to queue (true), or something was
     * queued or it is not near its end yet (false). When Spotify then plays something else, that is
     * autoplay after the music ran out (tolerated) or someone playing something else (pauses the
     * session). Unknown (null) right after the host started the music or a restart: tolerated.
     */
    dry: boolean | null
    /** When crowd-dj last started a track itself, so it does not start it again too soon. */
    startedAt: number | null
    timer: ReturnType<typeof setTimeout> | null
    /** When the timer fires (wall clock), so a poke only ever brings it forward. */
    dueAt: number
    /** Runs of this session, one after the other, so a poll and a host's request do not mix. */
    queue: Promise<unknown>
}

function problemOf(error: unknown): PlayerProblem {
    if (!(error instanceof SpotifyError)) return 'failed'
    if (error.invalidGrant) return 'signin'
    if (error.status === 404) return 'no_device'
    // No Premium, a restricted device, or the account is not on the app's allowlist
    if (error.status === 403) return 'refused'
    if (error.status === 429) return 'busy'
    return 'failed'
}

/**
 * The session engine: for each session that plays, it asks the playing account's player what it
 * does, hands Spotify the next track shortly before the current one ends, notices when Spotify
 * moved on to it, and pauses the session when someone plays something else on the account. Only
 * one track of a session is in Spotify's queue at a time; crowd-dj keeps the rest of the order.
 */
export function createEngine({
    db,
    api,
    sessions,
    picker,
    events,
    now = () => new Date(),
    schedule = true
}: {
    db: Database
    api: PlayerApi
    sessions: Sessions
    picker: Picker
    events: Events
    now?: () => Date
    /** Off in tests, which call `tick` themselves. */
    schedule?: boolean
}) {
    const memory = new Map<string, Memory>()

    function remember(sessionId: string): Memory {
        let entry = memory.get(sessionId)
        if (!entry) {
            entry = {
                live: null,
                dry: null,
                startedAt: null,
                timer: null,
                dueAt: 0,
                queue: Promise.resolve()
            }
            memory.set(sessionId, entry)
        }
        return entry
    }

    /** Stops looking at the session's player; what it was doing is no longer known. */
    function forget(sessionId: string) {
        const entry = memory.get(sessionId)
        if (!entry) return
        if (entry.timer) clearTimeout(entry.timer)
        entry.timer = null
        entry.live = null
        entry.dry = null
        entry.startedAt = null
    }

    /** Runs one thing at a time per session. */
    function serial<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
        const entry = remember(sessionId)
        const result = entry.queue.then(run, run)
        entry.queue = result.catch(() => {})
        return result
    }

    /** Looks at the player again after `delay`, or no more (null). */
    function plan(sessionId: string, delay: number | null) {
        const entry = memory.get(sessionId)
        if (!entry) return
        if (entry.timer) clearTimeout(entry.timer)
        entry.timer = null
        if (delay === null) {
            memory.delete(sessionId)
            return
        }
        if (!schedule) return
        entry.dueAt = Date.now() + delay
        entry.timer = setTimeout(() => {
            entry.timer = null
            run(sessionId)
        }, delay)
        entry.timer.unref?.()
    }

    function run(sessionId: string) {
        serial(sessionId, () => tick(sessionId))
            .catch((error) => {
                console.error(errorSummary(error))
                return ERROR_POLL_MS
            })
            .then((delay) => plan(sessionId, delay))
    }

    /** The host's player, else the host. */
    async function playingAccount(hostId: string): Promise<string> {
        const player = await db.query.spotifyAccount.findFirst({
            columns: { id: true },
            where: eq(spotifyAccount.playerOf, hostId)
        })
        return player?.id ?? hostId
    }

    /** The track that plays (started, not ended) and the one queued in Spotify (not started). */
    async function ours(sessionId: string): Promise<{ current?: Play; queued?: Play }> {
        const rows = await db
            .select()
            .from(play)
            .where(and(eq(play.sessionId, sessionId), isNull(play.endedAt)))
        return {
            current: rows.find((row) => row.startedAt),
            queued: rows.find((row) => !row.startedAt)
        }
    }

    async function endPlay(row: Play | undefined, at: Date) {
        if (row) await db.update(play).set({ endedAt: at }).where(eq(play.id, row.id))
    }

    /**
     * Records the next track as handed to Spotify (its wish counts as played from now on, so it
     * cannot be taken back any more) and hands it over: queued after what plays, or played right
     * away. Undone when Spotify refuses. `nothing` when there is nothing to play, `retry` when a
     * wish was taken back or the track taken meanwhile.
     */
    async function handOver(
        session: Session,
        accountId: string,
        how: 'queue' | 'play',
        deviceId?: string
    ): Promise<Play | 'nothing' | 'retry'> {
        const next = await picker.next(session)
        if (!next) return 'nothing'
        const at = now()
        if (next.wishId) {
            // Only while the wish is still open: taking it back and handing it over exclude each other
            const marked = await db
                .update(wish)
                .set({ playedAt: at })
                .where(and(eq(wish.id, next.wishId), isNull(wish.playedAt)))
            if (marked.rowsAffected === 0) return 'retry'
        }
        const unmark = async () => {
            if (next.wishId)
                await db.update(wish).set({ playedAt: null }).where(eq(wish.id, next.wishId))
        }
        const [row] = await db
            .insert(play)
            .values({ id: randomId(), sessionId: session.id, queuedAt: at, ...next })
            .onConflictDoNothing()
            .returning()
        if (!row) {
            await unmark()
            return 'retry'
        }
        try {
            if (how === 'queue') await api.queue(accountId, next.trackId)
            else await api.play(accountId, next.trackId, deviceId)
        } catch (error) {
            await db.delete(play).where(eq(play.id, row.id))
            await unmark()
            throw error
        }
        return row
    }

    /**
     * Plays the queued track now: by skipping to it when it is next in Spotify's queue (so it does
     * not play twice), else right away. A device gets playback first.
     */
    async function playQueued(
        accountId: string,
        queued: Play,
        upcoming: string[],
        deviceId?: string
    ) {
        if (upcoming[0] === queued.trackId) {
            if (deviceId) await api.transfer(accountId, deviceId, false)
            await api.next(accountId)
        } else await api.play(accountId, queued.trackId, deviceId)
    }

    /** Keeps what the player does and tells the pages when it matters to them. */
    function observe(sessionId: string, live: Live) {
        const entry = remember(sessionId)
        const before = entry.live
        entry.live = live
        const expected = before?.isPlaying
            ? before.progressMs + (live.at.getTime() - before.at.getTime())
            : before?.progressMs
        const changed =
            !before ||
            before.problem !== live.problem ||
            before.device !== live.device ||
            before.trackId !== live.trackId ||
            before.isPlaying !== live.isPlaying ||
            (expected !== undefined && Math.abs(live.progressMs - expected) > SEEK_TOLERANCE_MS)
        if (changed) events.publish(sessionId)
    }

    /** Someone played something else on the account: no more tracks until the host resumes. */
    async function pause(sessionId: string) {
        await db
            .update(play)
            .set({ endedAt: now() })
            .where(
                and(eq(play.sessionId, sessionId), isNull(play.endedAt), isNotNull(play.startedAt))
            )
        await sessions.setPlayback(sessionId, 'paused')
        forget(sessionId)
        events.publish(sessionId)
    }

    /** Whether the track was handed to Spotify in the session before. */
    async function handedOver(sessionId: string, trackId: string | null) {
        if (!trackId) return false
        const row = await db.query.play.findFirst({
            columns: { id: true },
            where: and(eq(play.sessionId, sessionId), eq(play.trackId, trackId))
        })
        return row !== undefined
    }

    /**
     * One look at the player and what follows from it. Returns when to look again, or null when the
     * session no longer plays.
     */
    async function tick(sessionId: string): Promise<number | null> {
        const session = await sessions.get(sessionId)
        if (!session || session.endedAt || session.playback !== 'playing') {
            forget(sessionId)
            return null
        }
        const entry = remember(sessionId)
        const accountId = await playingAccount(session.hostId)
        let state: PlayerState | null = null
        let problem: PlayerProblem | null = null
        let stopped = false
        let changed = false
        try {
            state = await api.playerState(accountId)
            if (!state?.device) {
                problem = 'no_device'
                return IDLE_POLL_MS
            }
            const delay = await follow(session, accountId, state, entry, () => (changed = true))
            stopped = delay === null
            return delay
        } catch (error) {
            problem = problemOf(error)
            if (problem === 'failed') console.error(errorSummary(error))
            return problem === 'no_device' ? IDLE_POLL_MS : ERROR_POLL_MS
        } finally {
            // Once per look, so a problem that keeps coming back tells the pages only once
            if (!stopped)
                observe(sessionId, {
                    problem,
                    device: state?.device?.name ?? null,
                    trackId: state?.trackId ?? null,
                    isPlaying: state?.isPlaying ?? false,
                    progressMs: state?.progressMs ?? 0,
                    durationMs: state?.durationMs ?? 0,
                    at: now()
                })
            if (changed) events.publish(sessionId)
        }
    }

    /** What follows from what the player does; see `tick`. */
    async function follow(
        session: Session,
        accountId: string,
        state: PlayerState,
        entry: Memory,
        changed: () => void
    ): Promise<number | null> {
        const at = now()
        let { current, queued } = await ours(session.id)
        // Episodes, ads and local files have no track or no length to time the next track by
        const timed = state.trackId !== null && state.durationMs > 0
        const remaining = timed ? Math.max(0, state.durationMs - state.progressMs) : Infinity
        const recentlyStarted =
            entry.startedAt !== null && at.getTime() - entry.startedAt < START_GRACE_MS

        /** Queues the next track when the one that plays is about to end. */
        const queueIfDue = async () => {
            if (queued || !state.isPlaying || remaining > QUEUE_AHEAD_MS) return
            const result = await handOver(session, accountId, 'queue')
            if (result === 'retry') return
            if (result === 'nothing') entry.dry = true
            else {
                queued = result
                entry.dry = false
                changed()
            }
        }
        /** When to look again while something plays: at its end, or when the next track is due. */
        const wait = () => {
            if (!state.isPlaying || !timed) return POLL_MS
            const until =
                queued || entry.dry ? remaining + MIN_DELAY_MS : remaining - QUEUE_AHEAD_MS
            return Math.min(POLL_MS, Math.max(MIN_DELAY_MS, until))
        }
        /** Plays the queued track (Spotify stopped before it) or the next one right away. */
        const playNow = async (): Promise<number> => {
            entry.dry = null
            if (queued) {
                await playQueued(accountId, queued, await api.userQueue(accountId))
                entry.startedAt = at.getTime()
                return POLL_MS
            }
            const result = await handOver(session, accountId, 'play')
            if (typeof result === 'string') return result === 'retry' ? MIN_DELAY_MS : POLL_MS
            entry.startedAt = at.getTime()
            changed()
            return MIN_DELAY_MS
        }

        if (queued && state.trackId === queued.trackId) {
            // Spotify moved on to the track crowd-dj queued
            await endPlay(current, at)
            const startedAt = new Date(at.getTime() - state.progressMs)
            await db.update(play).set({ startedAt }).where(eq(play.id, queued.id))
            current = { ...queued, startedAt }
            queued = undefined
            entry.dry = false
            entry.startedAt = null
            changed()
        }

        if (current && state.trackId === current.trackId) {
            if (state.isPlaying) {
                // Only music that plays is a sign of life: a session paused in Spotify ends as idle
                await sessions.touch(session.id)
                await queueIfDue()
                return wait()
            }
            const elapsed = at.getTime() - current.startedAt!.getTime()
            const ranOut =
                elapsed >= state.durationMs - FINISH_MARGIN_MS &&
                (state.progressMs <= FINISH_MARGIN_MS ||
                    state.progressMs >= state.durationMs - FINISH_MARGIN_MS)
            // Paused in the Spotify app: wait until it plays again
            if (!ranOut) return POLL_MS
            // The track ran out and Spotify stopped: what comes next plays right away
            await endPlay(current, at)
            changed()
            return await playNow()
        }

        if (!state.isPlaying) {
            // Nothing of the session plays and Spotify plays nothing: start the next track, unless
            // crowd-dj just did and Spotify does not show it yet
            if (recentlyStarted) return MIN_DELAY_MS
            if (current) {
                await endPlay(current, at)
                changed()
            }
            return await playNow()
        }

        // Spotify plays something crowd-dj did not hand it at this point
        if (current) {
            // A track of the session again (it was in Spotify's queue twice): not an interruption
            const again = await handedOver(session.id, state.trackId)
            if (!again && entry.dry === false) {
                await pause(session.id)
                return null
            }
            // Nothing was left to queue and Spotify went on by itself, or it is unknown (restart):
            // tolerated until something comes up, which then plays after the track that plays
            await endPlay(current, at)
            changed()
        }
        if (queued && entry.dry === null && !recentlyStarted) {
            // After a restart: the queued track may have played meanwhile
            if (!(await api.userQueue(accountId)).includes(queued.trackId)) {
                await db
                    .update(play)
                    .set({ startedAt: queued.queuedAt, endedAt: at })
                    .where(eq(play.id, queued.id))
                queued = undefined
                changed()
            }
            entry.dry = true
        }
        await queueIfDue()
        return wait()
    }

    return {
        tick,

        /** Starts looking at the players of the sessions that were playing when the server stopped. */
        async start() {
            for (const session of await sessions.playing()) run(session.id)
        },

        /** What the playing account did at the last look; null while the session does not play. */
        live(sessionId: string): Live | null {
            return memory.get(sessionId)?.live ?? null
        },

        /**
         * Something that may change what plays next happened (a wish, a pool, someone joined). When
         * the session waits for something to play, it looks soon instead of at the next poll. Only
         * ever brings the next look forward, so many changes neither delay it nor make it look more
         * often than every two seconds.
         */
        poke(sessionId: string) {
            const entry = memory.get(sessionId)
            if (!entry?.timer || entry.live?.problem) return
            const waiting = entry.dry === true || !entry.live?.isPlaying
            if (waiting && entry.dueAt > Date.now() + POKE_DELAY_MS) plan(sessionId, POKE_DELAY_MS)
        },

        /** The devices the session's playing account can play on. */
        async devices(session: Session): Promise<PlayerDevice[] | PlayerProblem> {
            try {
                return await api.devices(await playingAccount(session.hostId))
            } catch (error) {
                return problemOf(error)
            }
        },

        /**
         * The host starts the music, resumes after a pause, or picks a device. While a track of the
         * session plays, a device moves playback there; otherwise the next track starts right away
         * (on the device, if one is given), and the session plays from then on. With nothing to play
         * yet, the session plays as soon as something comes up.
         */
        play(sessionId: string, deviceId?: string): Promise<PlayResult> {
            return serial(sessionId, async () => {
                const session = await sessions.get(sessionId)
                if (!session || session.endedAt) return 'failed'
                const accountId = await playingAccount(session.hostId)
                const { current, queued } = await ours(sessionId)
                const playing = session.playback === 'playing'
                const entry = remember(sessionId)
                let result: PlayResult = 'ok'
                try {
                    if (playing && current) {
                        if (deviceId) await api.transfer(accountId, deviceId, true)
                        return 'ok'
                    }
                    let next = queued
                    if (next) {
                        const state = await api.playerState(accountId)
                        // Spotify got to it meanwhile (it stayed in its queue during the pause)
                        if (state?.trackId === next.trackId) {
                            if (deviceId) await api.transfer(accountId, deviceId, true)
                        } else {
                            const upcoming = await api.userQueue(accountId)
                            if (upcoming.includes(next.trackId))
                                await playQueued(accountId, next, upcoming, deviceId)
                            else {
                                // It played while the session was paused
                                await db
                                    .update(play)
                                    .set({ startedAt: next.queuedAt, endedAt: now() })
                                    .where(eq(play.id, next.id))
                                next = undefined
                            }
                        }
                    }
                    if (!next) {
                        const row = await handOver(session, accountId, 'play', deviceId)
                        if (typeof row === 'string') {
                            // Nothing to play yet: make the device the active one, so it is ready
                            if (deviceId) await api.transfer(accountId, deviceId, false)
                            result = 'nothing'
                        }
                    }
                    await endPlay(current, now())
                } catch (error) {
                    const problem = problemOf(error)
                    if (problem === 'failed') console.error(errorSummary(error))
                    if (!entry.timer && !playing) memory.delete(sessionId)
                    return problem
                }
                if (!playing) await sessions.setPlayback(sessionId, 'playing')
                entry.dry = null
                entry.startedAt = result === 'ok' ? now().getTime() : null
                events.publish(sessionId)
                plan(sessionId, MIN_DELAY_MS)
                return result
            })
        },

        /** Stops looking at the session's player, e.g. when the session ended. */
        stop(sessionId: string) {
            forget(sessionId)
            memory.delete(sessionId)
        }
    }
}

export type Engine = ReturnType<typeof createEngine>
