import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCatalog } from './catalog'
import { migrateDatabase } from './db/migrate'
import { openDatabase, type Database } from './db/open'
import { spotifyAccount, wish } from './db/schema'
import { createPools } from './pools'
import { createProfiles } from './profiles'
import { createSessions } from './sessions'
import type { SpotifyApi, SpotifyTrack } from './spotify/api'
import { createWishes } from './wishes'

const ID = (n: number) => `${'t'.repeat(20)}${String(n).padStart(2, '0')}`
const spotifyTrack = (n: number): SpotifyTrack => ({
    id: ID(n),
    title: `Track ${n}`,
    artists: ['Band'],
    album: 'Album',
    coverUrl: null,
    durationMs: 1000
})

let db: Database
let now: Date
let api: { [K in keyof SpotifyApi]: ReturnType<typeof vi.fn> }
let catalog: ReturnType<typeof createCatalog>

beforeEach(async () => {
    db = openDatabase('file::memory:')
    await migrateDatabase(db)
    now = new Date('2026-11-20T12:00:00Z')
    api = {
        search: vi.fn(),
        track: vi.fn(async (_account: string, id: string) =>
            id === ID(99) ? null : spotifyTrack(Number(id.slice(-2)))
        ),
        album: vi.fn(),
        artistAlbums: vi.fn()
    }
    catalog = createCatalog({ db, api: api as unknown as SpotifyApi, now: () => now })
})

describe('catalog', () => {
    it('looks tracks up once, keeps their order and leaves out unknown ones', async () => {
        const tracks = await catalog.tracks('host', [ID(2), ID(99), ID(1), ID(2), 'nonsense'])
        expect(tracks.map((track) => track.title)).toEqual(['Track 2', 'Track 1'])
        expect(tracks[0].spotifyUrl).toBe(`https://open.spotify.com/track/${ID(2)}`)
        expect(api.track).toHaveBeenCalledTimes(3)
        await catalog.tracks('host', [ID(1), ID(2)])
        expect(api.track).toHaveBeenCalledTimes(3)
    })

    it('charges only lookups and asks for unknown IDs only once in a while', async () => {
        const charge = vi.fn()
        await catalog.tracks('host', [ID(1), ID(99)], charge)
        expect(charge).toHaveBeenLastCalledWith(2)
        await catalog.tracks('host', [ID(1), ID(99), ID(2)], charge)
        expect(charge).toHaveBeenLastCalledWith(1)
        expect(api.track).toHaveBeenCalledTimes(3)
        now = new Date(now.getTime() + 61 * 60 * 1000)
        await catalog.tracks('host', [ID(99)], charge)
        expect(api.track).toHaveBeenCalledTimes(4)
    })

    it('keeps the tracks found before a lookup failed', async () => {
        api.track.mockImplementation(async (_account: string, id: string) => {
            if (id === ID(5)) throw new Error('timeout')
            return spotifyTrack(Number(id.slice(-2)))
        })
        await expect(catalog.tracks('host', [1, 2, 3, 4, 5].map(ID))).rejects.toThrow()
        api.track.mockClear()
        expect(await catalog.tracks('host', [1, 2, 3].map(ID))).toHaveLength(3)
        expect(api.track).not.toHaveBeenCalled()
    })

    it('reuses search results for a while and caches their tracks', async () => {
        api.search.mockResolvedValue({ tracks: [spotifyTrack(5)], albums: [], artists: [] })
        await catalog.search('host', 'Band')
        await catalog.search('host', 'band')
        expect(api.search).toHaveBeenCalledTimes(1)
        expect(await catalog.tracks('host', [ID(5)])).toHaveLength(1)
        expect(api.track).not.toHaveBeenCalled()
        now = new Date(now.getTime() + 11 * 60 * 1000)
        await catalog.search('host', 'band')
        expect(api.search).toHaveBeenCalledTimes(2)
    })
})

describe('pools and wishes', () => {
    let pools: ReturnType<typeof createPools>
    let wishes: ReturnType<typeof createWishes>
    let sessions: ReturnType<typeof createSessions>
    let alex: string
    let sam: string

    beforeEach(async () => {
        pools = createPools({ db, now: () => now })
        wishes = createWishes({ db, now: () => now })
        sessions = createSessions({ db, now: () => now })
        const profiles = createProfiles({ db, now: () => now })
        alex = (await profiles.create('Alex')).profile.id
        sam = (await profiles.create('Sam')).profile.id
        await db.insert(spotifyAccount).values({
            id: 'host',
            refreshToken: 'x',
            scope: '',
            authorizedAt: now,
            createdAt: now
        })
        await catalog.tracks('host', [1, 2, 3, 4].map(ID))
    })

    it('keeps a pool newest first; adding a track again makes it the newest', async () => {
        await pools.add(alex, [ID(1), ID(2)])
        now = new Date(now.getTime() + 1000)
        await pools.add(alex, [ID(3)])
        expect((await pools.list(alex)).map((entry) => entry.track.id)).toEqual([
            ID(3),
            ID(1),
            ID(2)
        ])
        now = new Date(now.getTime() + 1000)
        await pools.add(alex, [ID(2)])
        await pools.remove(alex, ID(1))
        expect((await pools.list(alex)).map((entry) => entry.track.id)).toEqual([ID(2), ID(3)])
        expect(await pools.list(sam)).toEqual([])
    })

    it('takes wishes within the limits and each track once per session', async () => {
        const session = await sessions.start('host')
        await sessions.updateSettings(session.id, {
            ...session,
            maxOpenWishes: 2,
            maxSessionWishes: 3
        })
        const limited = (await sessions.get(session.id))!
        expect(await wishes.add(limited, alex, ID(1))).toBeNull()
        expect(await wishes.add(limited, sam, ID(1))).toBe('taken')
        expect(await wishes.add(limited, alex, ID(2))).toBeNull()
        expect(await wishes.add(limited, alex, ID(3))).toBe('openLimit')

        // Played wishes no longer count as open, but still count for the session
        await db.update(wish).set({ playedAt: now })
        expect(await wishes.add(limited, alex, ID(3))).toBeNull()
        expect(await wishes.counts(session.id, alex)).toEqual({ open: 1, total: 3 })
        expect(await wishes.add(limited, alex, ID(4))).toBe('sessionLimit')

        // A withdrawn wish counts for nothing; played ones cannot be withdrawn
        const list = await wishes.list(session.id, alex)
        expect(list.map((item) => item.track.id)).toEqual([ID(1), ID(2), ID(3)])
        for (const item of list) await wishes.withdraw(session.id, alex, item.id)
        expect(await wishes.counts(session.id, alex)).toEqual({ open: 0, total: 2 })
        expect(await wishes.add(limited, alex, ID(4))).toBeNull()
    })

    it('does not let concurrent wishes slip under a limit', async () => {
        const session = await sessions.start('host')
        const limited = { ...session, maxOpenWishes: 1 }
        const results = await Promise.all([1, 2, 3, 4].map((n) => wishes.add(limited, alex, ID(n))))
        expect(results.filter((result) => result === null)).toHaveLength(1)
    })

    it('takes no wishes in a session that plays pools only', async () => {
        const session = await sessions.start('host')
        expect(await wishes.add({ ...session, mode: 'pool_only' }, alex, ID(1))).toBe('mode')
    })
})
