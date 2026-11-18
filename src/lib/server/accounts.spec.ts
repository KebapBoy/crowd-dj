import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccounts, REFRESH_TOKEN_LIFETIME_MS } from './accounts'
import { tokenKey } from './crypto'
import { migrateDatabase } from './db/migrate'
import { openDatabase, type Database } from './db/open'
import { SpotifyError } from './spotify/oauth'

const key = tokenKey('test-secret-test-secret-test-secret')
const ADMIN = 'admin-user'

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    })
}

const tokens = (id: string) => ({
    accessToken: `access-${id}`,
    refreshToken: `refresh-${id}`,
    expiresIn: 3600,
    scope: 'user-read-playback-state'
})
const profile = (id: string) => ({ id, displayName: id, imageUrl: null })

let db: Database
let now: Date
let fetchMock: ReturnType<typeof vi.fn>
let accounts: ReturnType<typeof createAccounts>

beforeEach(async () => {
    db = openDatabase('file::memory:')
    await migrateDatabase(db)
    now = new Date('2026-11-18T12:00:00Z')
    fetchMock = vi.fn()
    accounts = createAccounts({
        db,
        key,
        client: { clientId: 'id', clientSecret: 'secret', fetch: fetchMock as typeof fetch },
        adminId: ADMIN,
        now: () => now
    })
})

describe('accounts', () => {
    it('stores tokens encrypted and hands out the access token while it is valid', async () => {
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        const row = await db.query.spotifyAccount.findFirst()
        expect(row?.refreshToken).not.toContain('refresh-a')
        expect(row?.accessToken).not.toContain('access-a')
        expect(await accounts.accessToken('a')).toBe('access-a')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refreshes an expired access token once for concurrent callers and keeps a new refresh token', async () => {
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        now = new Date(now.getTime() + 3600 * 1000)
        fetchMock.mockResolvedValue(
            json({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
        )
        const results = await Promise.all([accounts.accessToken('a'), accounts.accessToken('a')])
        expect(results).toEqual(['access-new', 'access-new'])
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const body = String(fetchMock.mock.calls[0][1].body)
        expect(body).toContain('grant_type=refresh_token')
        expect(body).toContain('refresh_token=refresh-a')

        now = new Date(now.getTime() + 3600 * 1000)
        fetchMock.mockResolvedValue(json({ access_token: 'access-3', expires_in: 3600 }))
        await accounts.accessToken('a')
        expect(String(fetchMock.mock.calls[1][1].body)).toContain('refresh_token=refresh-new')
    })

    it('marks the account as revoked when Spotify rejects the refresh token', async () => {
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        await accounts.invalidateAccessToken('a')
        fetchMock.mockResolvedValue(json({ error: 'invalid_grant' }, 400))
        await expect(accounts.accessToken('a')).rejects.toBeInstanceOf(SpotifyError)
        expect((await accounts.get('a'))?.tokenStatus).toBe('revoked')
        await expect(accounts.accessToken('a')).rejects.toThrow()
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // Signing in again clears it
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        expect((await accounts.get('a'))?.tokenStatus).toBe('ok')
    })

    it('warns before the refresh token expires', async () => {
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        now = new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS - 24 * 3600 * 1000)
        expect((await accounts.get('a'))?.tokenStatus).toBe('expiring')
        now = new Date(now.getTime() + 2 * 24 * 3600 * 1000)
        expect((await accounts.get('a'))?.tokenStatus).toBe('expired')
    })

    it('treats the admin as approved and approves hosts', async () => {
        await accounts.saveAuthorization(tokens(ADMIN), profile(ADMIN))
        await accounts.saveAuthorization(tokens('host'), profile('host'))
        expect(await accounts.get(ADMIN)).toMatchObject({ isAdmin: true, approved: true })
        expect(await accounts.get('host')).toMatchObject({ isAdmin: false, approved: false })
        await accounts.setApproved('host', true)
        expect((await accounts.get('host'))?.approved).toBe(true)
        await expect(accounts.remove(ADMIN)).rejects.toThrow()
    })

    it('swaps the room account and deletes the previous one unless it signs in on its own', async () => {
        await accounts.saveAuthorization(tokens('room1'), profile('room1'))
        await accounts.replaceRoomAccount('room1')
        expect((await accounts.roomAccount())?.id).toBe('room1')

        await accounts.saveAuthorization(tokens('room2'), profile('room2'))
        await accounts.replaceRoomAccount('room2')
        expect((await accounts.roomAccount())?.id).toBe('room2')
        expect(await accounts.get('room1')).toBeNull()

        await accounts.setApproved('room2', true)
        await accounts.replaceRoomAccount(null)
        expect(await accounts.roomAccount()).toBeNull()
        expect(await accounts.get('room2')).not.toBeNull()
    })

    it('signs browsers in and out', async () => {
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        const { token } = await accounts.createLogin('a')
        expect((await accounts.accountForLogin(token))?.id).toBe('a')
        expect(await accounts.accountForLogin('wrong')).toBeNull()

        await accounts.deleteLogin(token)
        expect(await accounts.accountForLogin(token)).toBeNull()

        const second = await accounts.createLogin('a')
        now = new Date(now.getTime() + 31 * 24 * 3600 * 1000)
        expect(await accounts.accountForLogin(second.token)).toBeNull()
    })

    it('signs the browsers of a removed account out', async () => {
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        const { token } = await accounts.createLogin('a')
        await accounts.remove('a')
        expect(await accounts.accountForLogin(token)).toBeNull()
    })
})

describe('accounts after review', () => {
    it('revokes an account whose tokens were encrypted with another APP_SECRET', async () => {
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        const other = createAccounts({
            db,
            key: tokenKey('another-secret-another-secret-another'),
            client: { clientId: 'id', clientSecret: 'secret', fetch: fetchMock as typeof fetch },
            adminId: ADMIN,
            now: () => now
        })
        await expect(other.accessToken('a')).rejects.toMatchObject({ invalidGrant: true })
        expect((await other.get('a'))?.tokenStatus).toBe('revoked')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('keeps a previous room account that is signed in', async () => {
        await accounts.saveAuthorization(tokens('room1'), profile('room1'))
        await accounts.replaceRoomAccount('room1')
        await accounts.createLogin('room1')
        await accounts.replaceRoomAccount(null)
        expect(await accounts.get('room1')).not.toBeNull()
    })

    it('does not let a refresh overwrite a sign-in that happened meanwhile', async () => {
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        await accounts.invalidateAccessToken('a')
        let answer!: (response: Response) => void
        fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
        const refreshing = accounts.accessToken('a')
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
        await accounts.saveAuthorization(
            { ...tokens('a'), accessToken: 'access-signin', refreshToken: 'refresh-signin' },
            profile('a')
        )
        answer(json({ error: 'invalid_grant' }, 400))
        await expect(refreshing).rejects.toThrow()
        expect((await accounts.get('a'))?.tokenStatus).toBe('ok')
        expect(await accounts.accessToken('a')).toBe('access-signin')
    })
})
