import { beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from './db/migrate'
import { openDatabase, type Database } from './db/open'
import { spotifyAccount } from './db/schema'
import { createProfiles } from './profiles'
import { createSessions, IDLE_LIMIT_MS, parseSettings } from './sessions'

let db: Database
let now: Date
let sessions: ReturnType<typeof createSessions>
let profiles: ReturnType<typeof createProfiles>

async function addHost(id: string) {
    await db.insert(spotifyAccount).values({
        id,
        refreshToken: 'x',
        scope: '',
        authorizedAt: now,
        createdAt: now
    })
}

function form(values: Record<string, string>) {
    const data = new FormData()
    for (const [key, value] of Object.entries(values)) data.set(key, value)
    return data
}

beforeEach(async () => {
    db = openDatabase('file::memory:')
    await migrateDatabase(db)
    now = new Date('2026-11-19T12:00:00Z')
    sessions = createSessions({ db, now: () => now })
    profiles = createProfiles({ db, now: () => now })
    await addHost('host')
})

describe('sessions', () => {
    it('keeps one open session per host', async () => {
        const first = await sessions.start('host')
        expect(await sessions.start('host')).toEqual(first)
        await sessions.end(first.id)
        const ended = await sessions.get(first.id)
        expect(ended?.endReason).toBe('host')
        const second = await sessions.start('host')
        expect(second.id).not.toBe(first.id)
    })

    it('lets concurrent starts of one host share a session', async () => {
        const [a, b] = await Promise.all([sessions.start('host'), sessions.start('host')])
        expect(a.id).toBe(b.id)
    })

    it('ends a session after a while without a sign of life', async () => {
        const { id } = await sessions.start('host')
        now = new Date(now.getTime() + IDLE_LIMIT_MS - 1000)
        await sessions.touch(id)
        now = new Date(now.getTime() + IDLE_LIMIT_MS - 1000)
        expect((await sessions.get(id))?.endedAt).toBeNull()
        now = new Date(now.getTime() + 2000)
        await sessions.endIdle()
        expect((await sessions.get(id))?.endReason).toBe('idle')
    })

    it('treats an idle session as ended before the periodic check ran', async () => {
        const { id } = await sessions.start('host')
        now = new Date(now.getTime() + IDLE_LIMIT_MS + 1000)
        expect((await sessions.get(id))?.endReason).toBe('idle')
        expect((await sessions.start('host')).id).not.toBe(id)
    })

    it('does not offer a session of the host that just ended as idle', async () => {
        await sessions.start('host')
        now = new Date(now.getTime() + IDLE_LIMIT_MS + 1000)
        expect(await sessions.openOfHost('host')).toBeNull()
    })

    it('lists members once each, in the order they joined', async () => {
        const { id } = await sessions.start('host')
        const alex = await profiles.create('Alex')
        now = new Date(now.getTime() + 1000)
        const sam = await profiles.create('Sam')
        await sessions.join(id, alex.profile.id)
        now = new Date(now.getTime() + 1000)
        await sessions.join(id, sam.profile.id)
        await sessions.join(id, alex.profile.id)
        expect(await sessions.members(id)).toEqual([alex.profile, sam.profile])
    })

    it('stores settings and keeps the vote thresholds while voting is off', async () => {
        const { id } = await sessions.start('host')
        const parsed = parseSettings(
            form({ mode: 'pool_only', anonymous: 'on', maxOpenWishes: '3', maxPoolSize: '' })
        )
        if (!('settings' in parsed)) throw new Error('settings expected')
        await sessions.updateSettings(id, parsed.settings)
        expect(await sessions.get(id)).toMatchObject({
            mode: 'pool_only',
            anonymous: true,
            maxOpenWishes: 3,
            maxPoolSize: null,
            skipOwn: false,
            skipVoting: false,
            skipVotes: 2,
            skipPercent: 50
        })
    })
})

describe('parseSettings', () => {
    it('rejects values that are not allowed', () => {
        expect(parseSettings(form({ mode: 'loud' }))).toEqual({ problem: 'mode' })
        expect(parseSettings(form({ mode: 'pool_only', maxOpenWishes: '0' }))).toEqual({
            problem: 'limit'
        })
        expect(parseSettings(form({ mode: 'pool_only', maxPoolSize: '2.5' }))).toEqual({
            problem: 'limit'
        })
        expect(
            parseSettings(
                form({ mode: 'pool_only', skipVoting: 'on', skipVotes: '2', skipPercent: '101' })
            )
        ).toEqual({ problem: 'skipPercent' })
        expect(parseSettings(form({}))).toEqual({ problem: 'mode' })
        for (const value of ['1e2', '-1', '1000'])
            expect(parseSettings(form({ mode: 'pool_only', maxPoolSize: value }))).toEqual({
                problem: 'limit'
            })
    })

    it('takes the vote thresholds while voting is on', () => {
        expect(
            parseSettings(
                form({
                    mode: 'wishes_first',
                    skipVoting: 'on',
                    skipVotes: ' 3 ',
                    skipPercent: '40'
                })
            )
        ).toMatchObject({ settings: { skipVoting: true, skipVotes: 3, skipPercent: 40 } })
    })
})
