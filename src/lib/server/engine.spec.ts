import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { migrateDatabase } from './db/migrate'
import { openDatabase, type Database } from './db/open'
import { play, session as sessionTable, spotifyAccount, track } from './db/schema'
import { createEngine, QUEUE_AHEAD_MS, type PlayerApi } from './engine'
import { createEvents } from './events'
import { createPicker } from './picker'
import { createPlayingView } from './playing'
import { createPools } from './pools'
import { createProfiles } from './profiles'
import { createSessions } from './sessions'
import { createSkips } from './skips'
import type { PlayerState } from './spotify/api'
import { SpotifyError } from './spotify/oauth'
import { createWishes } from './wishes'

const ID = (n: number) => `${'t'.repeat(20)}${String(n).padStart(2, '0')}`
const DURATION = 200_000

let db: Database
let now: Date
let sessions: ReturnType<typeof createSessions>
let pools: ReturnType<typeof createPools>
let wishes: ReturnType<typeof createWishes>
let picker: ReturnType<typeof createPicker>
let sessionId: string
let alex: string
let sam: string

const session = async () => (await sessions.get(sessionId))!
const later = (ms: number) => (now = new Date(now.getTime() + ms))

beforeEach(async () => {
    db = openDatabase('file::memory:')
    await migrateDatabase(db)
    now = new Date('2026-11-20T12:00:00Z')
    const clock = { now: () => now }
    sessions = createSessions({ db, ...clock })
    pools = createPools({ db, ...clock })
    wishes = createWishes({ db, ...clock })
    picker = createPicker({ db })
    const profiles = createProfiles({ db, ...clock })
    await db.insert(spotifyAccount).values({
        id: 'host',
        refreshToken: 'x',
        scope: 'user-read-playback-state user-modify-playback-state',
        authorizedAt: now,
        createdAt: now
    })
    await db.insert(track).values(
        Array.from({ length: 20 }, (_, i) => ({
            id: ID(i + 1),
            title: `Track ${i + 1}`,
            artists: ['Band'],
            album: 'Album',
            durationMs: DURATION,
            fetchedAt: now
        }))
    )
    sessionId = (await sessions.start('host')).id
    alex = (await profiles.create('Alex')).profile.id
    sam = (await profiles.create('Sam')).profile.id
    await sessions.join(sessionId, alex)
    later(1000)
    await sessions.join(sessionId, sam)
})

/** Records a track as played for someone, as the engine would. */
async function played(trackId: string, profileId: string) {
    later(1000)
    await db.insert(play).values({
        id: trackId,
        sessionId,
        trackId,
        profileId,
        queuedAt: now,
        startedAt: now,
        endedAt: now
    })
}

describe('picker', () => {
    it('plays open wishes before pools, in turns, and no track twice', async () => {
        await pools.add(sam, [ID(5)])
        await wishes.add(await session(), sam, ID(1))
        await wishes.add(await session(), alex, ID(2))
        await wishes.add(await session(), alex, ID(3))
        // Alex joined first
        expect(await picker.next(await session())).toEqual({
            profileId: alex,
            trackId: ID(2),
            wishId: expect.any(String)
        })
        await played(ID(2), alex)
        expect((await picker.next(await session()))?.trackId).toBe(ID(1))
        await played(ID(1), sam)
        // Sam has no wish left, but Alex has: wishes come first
        expect((await picker.next(await session()))?.trackId).toBe(ID(3))
        await played(ID(3), alex)
        expect(await picker.next(await session())).toEqual({
            profileId: sam,
            trackId: ID(5),
            wishId: null
        })
        expect(await wishes.add(await session(), alex, ID(2))).toBe('played')
    })

    it('takes a stable random track from the newest of each pool in turns', async () => {
        await db.update(sessionTable).set({ mode: 'pool_only', maxPoolSize: 2 })
        await pools.add(alex, [ID(1), ID(2), ID(3)])
        later(1000)
        await pools.add(alex, [ID(4)])
        await pools.add(sam, [ID(10)])
        const first = await picker.next(await session())
        expect(await picker.next(await session())).toEqual(first)
        expect(first?.profileId).toBe(alex)
        // Only the two newest count: 4 and 1
        expect([ID(4), ID(1)]).toContain(first?.trackId)
        await played(first!.trackId, alex)
        expect((await picker.next(await session()))?.trackId).toBe(ID(10))
        await played(ID(10), sam)
        const third = await picker.next(await session())
        expect(third?.profileId).toBe(alex)
        expect([ID(4), ID(1)].filter((id) => id !== first!.trackId)).toContain(third?.trackId)
    })

    it('leaves out wished tracks and people who left, and has nothing without wishes when asked', async () => {
        await pools.add(alex, [ID(1)])
        await wishes.add(await session(), sam, ID(1))
        expect((await picker.next(await session()))?.profileId).toBe(sam)
        await sessions.leave(sessionId, sam)
        expect(await picker.next(await session())).toBeNull()
        await db.update(sessionTable).set({ mode: 'wishes_only' })
        await pools.add(alex, [ID(2)])
        expect(await picker.next(await session())).toBeNull()
    })
})

describe('engine', () => {
    let player: PlayerState | null
    let spotifyQueue: string[]
    let api: { [K in keyof PlayerApi]: ReturnType<typeof vi.fn> }
    let events: ReturnType<typeof createEvents>
    let engine: ReturnType<typeof createEngine>
    let skips: ReturnType<typeof createSkips>
    /** Profiles with the session open. */
    let there: Set<string>

    const playing = (trackId: string, progressMs = 0, isPlaying = true): PlayerState => ({
        device: { id: 'speaker', name: 'Speaker' },
        isPlaying,
        trackId,
        progressMs,
        durationMs: DURATION
    })
    const rows = () => db.select().from(play).orderBy(play.queuedAt)

    beforeEach(() => {
        player = null
        spotifyQueue = []
        api = {
            playerState: vi.fn(async () => player),
            devices: vi.fn(async () => []),
            play: vi.fn(async (_account: string, trackId: string) => {
                player = playing(trackId)
            }),
            queue: vi.fn(async (_account: string, trackId: string) => {
                spotifyQueue.push(trackId)
            }),
            userQueue: vi.fn(async () => [...spotifyQueue]),
            transfer: vi.fn(),
            next: vi.fn(async () => {
                player = playing(spotifyQueue.shift()!)
            })
        }
        events = createEvents({ delayMs: 0 })
        there = new Set()
        skips = createSkips({ db, present: () => there, now: () => now })
        engine = createEngine({
            db,
            api: api as unknown as PlayerApi,
            sessions,
            picker,
            events,
            votesReached: skips.reached,
            now: () => now,
            schedule: false
        })
    })

    it('starts on the host`s request, queues shortly before the end and moves on', async () => {
        await pools.add(alex, [ID(1)])
        await pools.add(sam, [ID(2)])
        expect((await session()).playback).toBe('stopped')
        expect(await engine.tick(sessionId)).toBeNull()

        expect(await engine.play(sessionId)).toBe('ok')
        expect(api.play).toHaveBeenCalledWith('host', ID(1), undefined)
        expect((await session()).playback).toBe('playing')
        await engine.tick(sessionId)
        expect((await rows())[0].startedAt).not.toBeNull()
        expect(engine.live(sessionId)?.device).toBe('Speaker')

        // Nothing queued while there is time left
        player = playing(ID(1), DURATION - QUEUE_AHEAD_MS - 10_000)
        later(5000)
        expect(await engine.tick(sessionId)).toBe(5000)
        expect(api.queue).not.toHaveBeenCalled()
        player = playing(ID(1), DURATION - QUEUE_AHEAD_MS + 1000)
        await engine.tick(sessionId)
        expect(spotifyQueue).toEqual([ID(2)])

        // Spotify moves on
        player = playing(ID(2), 500)
        later(15_000)
        await engine.tick(sessionId)
        const [first, second] = await rows()
        expect(first.endedAt).not.toBeNull()
        expect(second).toMatchObject({ trackId: ID(2), profileId: sam, endedAt: null })
        expect(second.startedAt).not.toBeNull()

        const view = await createPlayingView({
            db,
            picker,
            skips,
            live: engine.live,
            now: () => now
        }).view(await session(), { profileId: sam, isHost: false, member: true })
        expect(view.current).toMatchObject({ mine: true, by: null, isPlaying: true })
        expect(view.current?.track.id).toBe(ID(2))
    })

    it('marks a wish played when it is handed over and undoes it when Spotify refuses', async () => {
        await wishes.add(await session(), alex, ID(3))
        api.play.mockRejectedValueOnce(new SpotifyError('no device', 404))
        expect(await engine.play(sessionId)).toBe('no_device')
        expect(await rows()).toHaveLength(0)
        expect((await wishes.list(sessionId, alex))[0].playedAt).toBeNull()
        expect(await engine.play(sessionId)).toBe('ok')
        expect((await wishes.list(sessionId, alex))[0].playedAt).not.toBeNull()
        expect(
            await wishes.withdraw(sessionId, alex, (await wishes.list(sessionId, alex))[0].id)
        ).toBe(false)
    })

    it('pauses the session when someone plays something else', async () => {
        await pools.add(alex, [ID(1)])
        await pools.add(sam, [ID(2)])
        await engine.play(sessionId)
        await engine.tick(sessionId)
        const changed = vi.fn()
        events.subscribe(sessionId, 'test', changed)
        player = playing(ID(19), 1000)
        later(5000)
        expect(await engine.tick(sessionId)).toBeNull()
        expect((await session()).playback).toBe('paused')
        expect((await rows())[0].endedAt).not.toBeNull()
        expect(changed).toHaveBeenCalled()

        // Resuming plays the next track right away
        expect(await engine.play(sessionId)).toBe('ok')
        expect(player?.trackId).toBe(ID(2))
        expect((await session()).playback).toBe('playing')
    })

    it('tolerates Spotify going on by itself after the queue ran dry, and queues after it', async () => {
        await pools.add(alex, [ID(1)])
        await engine.play(sessionId)
        await engine.tick(sessionId)
        player = playing(ID(1), DURATION - 5000)
        later(5000)
        await engine.tick(sessionId)
        expect(api.queue).not.toHaveBeenCalled()

        // Autoplay: not paused
        player = playing(ID(18), 1000)
        later(6000)
        expect(await engine.tick(sessionId)).not.toBeNull()
        expect((await session()).playback).toBe('playing')
        expect((await rows())[0].endedAt).not.toBeNull()

        // A wish comes up and is queued after the track that plays
        await wishes.add(await session(), sam, ID(4))
        player = playing(ID(18), DURATION - 10_000)
        later(5000)
        await engine.tick(sessionId)
        expect(spotifyQueue).toEqual([ID(4)])
        player = playing(ID(4), 0)
        later(11_000)
        await engine.tick(sessionId)
        expect((await rows())[1]).toMatchObject({ trackId: ID(4), endedAt: null })
        expect((await rows())[1].startedAt).not.toBeNull()
    })

    it('waits while paused in Spotify and plays on when the last track ran out', async () => {
        await pools.add(alex, [ID(1)])
        await engine.play(sessionId)
        await engine.tick(sessionId)
        player = playing(ID(1), 60_000, false)
        later(60_000)
        expect(await engine.tick(sessionId)).toBe(5000)
        expect(await rows()).toHaveLength(1)

        // Ran out with nothing left: Spotify stops at the start of the track
        player = playing(ID(1), DURATION - 5000)
        later(DURATION)
        await engine.tick(sessionId)
        player = playing(ID(1), 0, false)
        later(6000)
        await engine.tick(sessionId)
        expect((await rows())[0].endedAt).not.toBeNull()
        expect(api.play).toHaveBeenCalledTimes(1)

        // Something comes up: plays right away
        await pools.add(sam, [ID(2)])
        later(5000)
        await engine.tick(sessionId)
        expect(api.play).toHaveBeenLastCalledWith('host', ID(2), undefined)
    })

    it('tells the host when there is no device, and stops with the session', async () => {
        await pools.add(alex, [ID(1)])
        await engine.play(sessionId)
        player = null
        expect(await engine.tick(sessionId)).toBe(10_000)
        expect(engine.live(sessionId)?.problem).toBe('no_device')
        api.playerState.mockRejectedValueOnce(new SpotifyError('gone', 401, true))
        expect(await engine.tick(sessionId)).toBe(30_000)
        expect(engine.live(sessionId)?.problem).toBe('signin')
        await sessions.end(sessionId)
        expect(await engine.tick(sessionId)).toBeNull()
    })

    it('does not ask Spotify while the playing account has not allowed playback', async () => {
        await pools.add(alex, [ID(1)])
        await db.update(spotifyAccount).set({ scope: '' })
        expect(await engine.play(sessionId)).toBe('not_allowed')
        expect(await engine.devices(await session())).toBe('not_allowed')
        expect(api.playerState).not.toHaveBeenCalled()
        // A player that allows playback plays instead of the host
        await db.insert(spotifyAccount).values({
            id: 'player',
            refreshToken: 'x',
            scope: 'user-read-playback-state user-modify-playback-state',
            playerOf: 'host',
            authorizedAt: now,
            createdAt: now
        })
        expect(await engine.play(sessionId)).toBe('ok')
        expect(api.play).toHaveBeenLastCalledWith('player', ID(1), undefined)
    })

    it('skips to the queued track on resume when it is next in Spotify`s queue', async () => {
        await pools.add(alex, [ID(1)])
        await pools.add(sam, [ID(2)])
        await engine.play(sessionId)
        await engine.tick(sessionId)
        player = playing(ID(1), DURATION - 10_000)
        later(5000)
        await engine.tick(sessionId)
        expect(spotifyQueue).toHaveLength(1)
        // Someone plays something else before the queued track: paused
        player = playing(ID(19), 0)
        later(5000)
        expect(await engine.tick(sessionId)).toBeNull()
        await engine.play(sessionId)
        expect(api.next).toHaveBeenCalled()
        expect(spotifyQueue).toHaveLength(0)
        await engine.tick(sessionId)
        const queued = (await rows())[1]
        expect(queued.startedAt).not.toBeNull()
        expect(await db.select().from(play).where(eq(play.trackId, queued.trackId))).toHaveLength(1)
    })

    it('starts when Spotify sits paused on a track of its own and music comes up', async () => {
        player = playing(ID(19), 30_000, false)
        expect(await engine.play(sessionId)).toBe('nothing')
        later(5000)
        await engine.tick(sessionId)
        expect(api.play).not.toHaveBeenCalled()
        await wishes.add(await session(), sam, ID(3))
        later(5000)
        await engine.tick(sessionId)
        expect(api.play).toHaveBeenCalledWith('host', ID(3), undefined)
    })

    it('does not play the queued track again when it played during a pause', async () => {
        await pools.add(alex, [ID(1)])
        await pools.add(sam, [ID(2)])
        await engine.play(sessionId)
        await engine.tick(sessionId)
        player = playing(ID(1), DURATION - 10_000)
        later(5000)
        await engine.tick(sessionId)
        player = playing(ID(19), 0)
        later(5000)
        expect(await engine.tick(sessionId)).toBeNull()
        // Spotify played the queued track meanwhile
        spotifyQueue = []
        api.play.mockClear()
        await pools.add(alex, [ID(5)])
        expect(await engine.play(sessionId)).toBe('ok')
        expect(api.play).toHaveBeenCalledWith('host', ID(5), undefined)
        expect(api.play).not.toHaveBeenCalledWith('host', ID(2), expect.anything())
        expect((await rows()).find((row) => row.trackId === ID(2))?.endedAt).not.toBeNull()
    })

    it('resumes on a device by skipping to the queued track there', async () => {
        await pools.add(alex, [ID(1)])
        await pools.add(sam, [ID(2)])
        await engine.play(sessionId)
        await engine.tick(sessionId)
        player = playing(ID(1), DURATION - 10_000)
        later(5000)
        await engine.tick(sessionId)
        player = playing(ID(19), 0)
        later(5000)
        await engine.tick(sessionId)
        api.play.mockClear()
        await engine.play(sessionId, 'kitchen')
        expect(api.transfer).toHaveBeenCalledWith('host', 'kitchen', false)
        expect(api.next).toHaveBeenCalled()
        expect(api.play).not.toHaveBeenCalled()
    })

    it('does not time anything by an episode, and ends a session paused in Spotify as idle', async () => {
        await pools.add(alex, [ID(1)])
        player = { ...playing(ID(1)), trackId: null, durationMs: 0 }
        expect(await engine.play(sessionId)).toBe('ok')
        player = { ...playing(ID(1)), trackId: null, durationMs: 0, progressMs: 60_000 }
        later(10_000)
        expect(await engine.tick(sessionId)).toBe(5000)
        expect(api.queue).not.toHaveBeenCalled()

        player = playing(ID(1), 1000)
        later(1000)
        await engine.tick(sessionId)
        player = playing(ID(1), 30_000, false)
        for (let i = 0; i < 40; i++) {
            later(60_000)
            await engine.tick(sessionId)
        }
        expect((await session()).endedAt).not.toBeNull()
    })

    it('tells the pages about a problem that keeps coming back only once', async () => {
        await pools.add(alex, [ID(1)])
        await pools.add(sam, [ID(2)])
        await engine.play(sessionId)
        await engine.tick(sessionId)
        const changed = vi.fn()
        events.subscribe(sessionId, 'test', changed)
        api.queue.mockRejectedValue(new SpotifyError('refused', 403))
        player = playing(ID(1), DURATION - 10_000)
        later(5000)
        expect(await engine.tick(sessionId)).toBe(30_000)
        expect(engine.live(sessionId)?.problem).toBe('refused')
        const calls = changed.mock.calls.length
        player = playing(ID(1), DURATION - 9000)
        later(1000)
        await engine.tick(sessionId)
        expect(changed.mock.calls.length).toBe(calls)
    })

    describe('skipping', () => {
        /** The session's track that plays. */
        const current = async () => (await rows()).find((row) => row.startedAt && !row.endedAt)!

        beforeEach(async () => {
            await pools.add(alex, [ID(1)])
            await pools.add(sam, [ID(2)])
            await engine.play(sessionId)
            await engine.tick(sessionId)
        })

        it('skips to the track queued in Spotify', async () => {
            player = playing(ID(1), DURATION - 10_000)
            later(5000)
            await engine.tick(sessionId)
            expect(spotifyQueue).toEqual([ID(2)])
            const first = await current()
            expect(await engine.skip(sessionId, first.id)).toBe('ok')
            expect(api.next).toHaveBeenCalledTimes(1)
            expect(player?.trackId).toBe(ID(2))
            later(1000)
            await engine.tick(sessionId)
            expect((await current()).trackId).toBe(ID(2))
            expect((await rows())[0].endedAt).not.toBeNull()
            // A page that still shows the first track skips nothing
            expect(await engine.skip(sessionId, first.id)).toBe('gone')
            expect(api.next).toHaveBeenCalledTimes(1)
        })

        it('plays the next track right away when none is queued yet, else lets Spotify go on', async () => {
            later(5000)
            expect(await engine.skip(sessionId, (await current()).id)).toBe('ok')
            expect(api.play).toHaveBeenLastCalledWith('host', ID(2), undefined)
            later(1000)
            await engine.tick(sessionId)
            expect((await current()).trackId).toBe(ID(2))

            // Nothing left: Spotify goes on by itself, which does not pause the session
            spotifyQueue = [ID(17)]
            expect(await engine.skip(sessionId, (await current()).id)).toBe('ok')
            expect(api.next).toHaveBeenCalled()
            later(1000)
            expect(await engine.tick(sessionId)).not.toBeNull()
            expect((await session()).playback).toBe('playing')
            expect(await rows()).toHaveLength(2)
        })

        it('skips nothing that is paused in Spotify or that Spotify already left', async () => {
            const first = await current()
            api.play.mockClear()
            player = playing(ID(1), 30_000, false)
            expect(await engine.skip(sessionId, first.id)).toBe('paused')
            player = playing(ID(19), 0)
            expect(await engine.skip(sessionId, first.id)).toBe('gone')
            expect(api.play).not.toHaveBeenCalled()
            expect(api.next).not.toHaveBeenCalled()
            expect(await current()).toMatchObject({ id: first.id })
        })

        it('keeps the track when Spotify refuses the skip', async () => {
            api.play.mockRejectedValueOnce(new SpotifyError('refused', 403))
            const first = await current()
            expect(await engine.skip(sessionId, first.id)).toBe('refused')
            expect(await current()).toMatchObject({ id: first.id })
            expect(await rows()).toHaveLength(1)
        })

        describe('by votes', () => {
            let kim: string

            beforeEach(async () => {
                await db
                    .update(sessionTable)
                    .set({ skipVoting: true, skipVotes: 1, skipPercent: 60 })
                kim = (await createProfiles({ db }).create('Kim')).profile.id
                // Kim was there when the track started and has a pool too
                await sessions.join(sessionId, kim)
                await pools.add(kim, [ID(3)])
                there = new Set([alex, sam, kim])
            })

            it('skips once enough of those who are there voted', async () => {
                const first = await current()
                // Alex's track, and Alex may skip it directly: 60 % of Sam and Kim, two votes
                expect(await skips.vote(await session(), first.id, alex, true)).toBe('own')
                expect(await skips.vote(await session(), first.id, kim, true)).toBe('ok')
                expect(await skips.tally(await session(), first, kim)).toEqual({
                    count: 1,
                    needed: 2,
                    mine: true,
                    blocked: null
                })
                await skips.vote(await session(), first.id, kim, false)
                expect((await skips.tally(await session(), first)).count).toBe(0)
                await skips.vote(await session(), first.id, kim, true)
                await skips.vote(await session(), first.id, kim, true)
                expect((await skips.tally(await session(), first)).count).toBe(1)

                // Kim closed the page: the vote still counts, and Kim with it
                there = new Set([alex, sam])
                expect(await skips.tally(await session(), first)).toMatchObject({
                    count: 1,
                    needed: 2
                })
                later(5000)
                await engine.tick(sessionId)
                expect(await current()).toMatchObject({ id: first.id })

                // Sam leaves: Kim is the only one left to vote, so Kim's vote is enough, which the
                // engine notices at its next look at the player
                await sessions.leave(sessionId, sam)
                expect((await skips.tally(await session(), first)).needed).toBe(1)
                later(5000)
                await engine.tick(sessionId)
                expect(api.play).toHaveBeenLastCalledWith('host', ID(3), undefined)
                later(1000)
                await engine.tick(sessionId)
                expect((await current()).trackId).toBe(ID(3))
                // Votes belong to the track: none on the next, and none on one that ended
                expect((await skips.tally(await session(), await current())).count).toBe(0)
                expect(await skips.vote(await session(), first.id, kim, true)).toBe('gone')
            })

            it('takes at least the minimum, rounds the share up and caps both at the voters', async () => {
                const first = await current()
                await db.update(sessionTable).set({ skipOwn: false, skipVotes: 3, skipPercent: 50 })
                expect((await skips.tally(await session(), first)).needed).toBe(3)
                await db.update(sessionTable).set({ skipVotes: 1, skipPercent: 50 })
                expect((await skips.tally(await session(), first)).needed).toBe(2)
                await db.update(sessionTable).set({ skipVotes: 5 })
                expect((await skips.tally(await session(), first)).needed).toBe(3)
                there = new Set()
                expect((await skips.tally(await session(), first)).needed).toBe(1)
            })

            it('lets vote only who was there when the track started and added something', async () => {
                const first = await current()
                const profiles = createProfiles({ db, now: () => now })
                const lee = (await profiles.create('Lee')).profile.id
                const max = (await profiles.create('Max')).profile.id
                await sessions.join(sessionId, max)
                later(1000)
                await sessions.join(sessionId, lee)
                await pools.add(lee, [ID(4)])
                there = new Set([alex, sam, kim, lee, max])
                // Max has added nothing, Lee came during the track: neither votes nor counts
                expect(await skips.vote(await session(), first.id, max, true)).toBe('contribute')
                expect(await skips.vote(await session(), first.id, lee, true)).toBe('late')
                expect(await skips.vote(await session(), first.id, 'stranger', true)).toBe('member')
                expect(await skips.tally(await session(), first, lee)).toEqual({
                    count: 0,
                    needed: 2,
                    mine: false,
                    blocked: 'late'
                })
                // A wish in the session counts as adding something
                await wishes.add(await session(), max, ID(5))
                expect(await skips.vote(await session(), first.id, max, true)).toBe('ok')
                // 60 % of Sam, Kim and Max
                expect((await skips.tally(await session(), first)).needed).toBe(2)
            })

            it('votes on nothing but the track that plays', async () => {
                player = playing(ID(1), DURATION - 10_000)
                later(5000)
                await engine.tick(sessionId)
                const queued = (await rows()).find((row) => !row.startedAt)!
                expect(await skips.vote(await session(), queued.id, kim, true)).toBe('gone')
                expect(await skips.vote(await session(), 'other', kim, true)).toBe('gone')
            })

            it('does not try again at every look when Spotify refuses', async () => {
                const first = await current()
                await skips.vote(await session(), first.id, sam, true)
                await skips.vote(await session(), first.id, kim, true)
                api.play.mockRejectedValue(new SpotifyError('refused', 403))
                later(5000)
                expect(await engine.tick(sessionId)).not.toBeNull()
                later(5000)
                await engine.tick(sessionId)
                expect(api.play).toHaveBeenCalledTimes(2)
                expect(await current()).toMatchObject({ id: first.id })
                expect(await engine.skip(sessionId, first.id)).toBe('refused')
            })

            it('counts no votes while skip voting is off', async () => {
                const first = await current()
                await skips.vote(await session(), first.id, sam, true)
                await skips.vote(await session(), first.id, kim, true)
                await db.update(sessionTable).set({ skipVoting: false })
                expect(await skips.reached(await session(), first.id)).toBe(false)
                later(5000)
                await engine.tick(sessionId)
                expect(await current()).toMatchObject({ id: first.id })
            })
        })
    })
})

describe('leaving', () => {
    it('keeps a profile that left out until it joins on purpose', async () => {
        await sessions.leave(sessionId, alex)
        expect(await sessions.join(sessionId, alex)).toBe(false)
        expect(await sessions.membership(sessionId, alex)).toBe('left')
        expect((await sessions.members(sessionId)).map((member) => member.name)).toEqual(['Sam'])
        await sessions.rejoin(sessionId, alex)
        expect(await sessions.membership(sessionId, alex)).toBe('member')
    })
})
