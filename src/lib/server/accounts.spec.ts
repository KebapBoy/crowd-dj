import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccounts, REFRESH_TOKEN_LIFETIME_MS } from './accounts'
import { tokenKey } from './crypto'
import { migrateDatabase } from './db/migrate'
import { openDatabase, type Database } from './db/open'
import { SpotifyError } from './spotify/oauth'

const key = tokenKey('test-secret-test-secret-test-secret')

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

    it("connects, swaps and removes a host's player", async () => {
        await accounts.saveAuthorization(tokens('host'), profile('host'))
        expect(await accounts.playerProblem('host', 'host')).toBe('self')
        expect(await accounts.playerProblem('host', 'player1')).toBeNull()

        await accounts.connectPlayer('host', tokens('player1'), profile('player1'))
        expect((await accounts.player('host'))?.id).toBe('player1')
        expect((await accounts.get('player1'))?.playerOf).toBe('host')
        // Connecting it again renews it
        expect(await accounts.playerProblem('host', 'player1')).toBeNull()
        await accounts.connectPlayer('host', tokens('player1'), profile('player1'))

        await accounts.saveAuthorization(tokens('other'), profile('other'))
        expect(await accounts.playerProblem('other', 'player1')).toBe('taken')
        expect(await accounts.playerProblem('host', 'other')).toBe('host')

        // Swapping deletes the previous player with its tokens
        await accounts.connectPlayer('host', tokens('player2'), profile('player2'))
        expect(await accounts.get('player1')).toBeNull()
        expect((await accounts.player('host'))?.id).toBe('player2')

        await accounts.removePlayer('host')
        expect(await accounts.player('host')).toBeNull()
        expect(await accounts.get('player2')).toBeNull()
    })

    it('stores a player only together with its host', async () => {
        await accounts.saveAuthorization(tokens('host'), profile('host'))
        const broken = { ...tokens('player'), refreshToken: undefined }
        await expect(accounts.connectPlayer('host', broken, profile('player'))).rejects.toThrow()
        expect(await accounts.get('player')).toBeNull()
        expect(await accounts.playerProblem('host', 'player')).toBeNull()
    })

    it('keeps answering other queries while a player is connected', async () => {
        await accounts.saveAuthorization(tokens('host'), profile('host'))
        const [, host] = await Promise.all([
            accounts.connectPlayer('host', tokens('player'), profile('player')),
            accounts.get('host')
        ])
        expect(host?.id).toBe('host')
        expect((await accounts.player('host'))?.id).toBe('player')
    })

    it('deletes a host with its player and sign-ins', async () => {
        await accounts.saveAuthorization(tokens('host'), profile('host'))
        await accounts.connectPlayer('host', tokens('player'), profile('player'))
        const { token } = await accounts.createLogin('host')
        await accounts.removeHost('host')
        expect(await accounts.get('host')).toBeNull()
        expect(await accounts.get('player')).toBeNull()
        expect(await accounts.accountForLogin(token)).toBeNull()
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

    it('signs the browsers of a deleted account out', async () => {
        await accounts.saveAuthorization(tokens('a'), profile('a'))
        const { token } = await accounts.createLogin('a')
        await accounts.removeHost('a')
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
            now: () => now
        })
        await expect(other.accessToken('a')).rejects.toMatchObject({ invalidGrant: true })
        expect((await other.get('a'))?.tokenStatus).toBe('revoked')
        expect(fetchMock).not.toHaveBeenCalled()
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
