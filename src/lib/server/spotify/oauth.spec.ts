import { describe, expect, it, vi } from 'vitest'
import {
    allowsPlayback,
    authorizeUrl,
    exchangeCode,
    getProfile,
    PLAYBACK_SCOPES,
    SpotifyError
} from './oauth'

const client = { clientId: 'client-id', clientSecret: 'client-secret' }

describe('authorizeUrl', () => {
    it('asks for no scope by default, with state and redirect URI', () => {
        const url = new URL(
            authorizeUrl(client, { redirectUri: 'http://127.0.0.1:5173/auth/callback', state: 's' })
        )
        expect(url.origin).toBe('https://accounts.spotify.com')
        expect(url.searchParams.get('client_id')).toBe('client-id')
        expect(url.searchParams.has('scope')).toBe(false)
        expect(url.searchParams.get('state')).toBe('s')
        expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/auth/callback')
        expect(url.searchParams.has('show_dialog')).toBe(false)
    })

    it('asks for the scopes it is given', () => {
        const url = new URL(
            authorizeUrl(client, { redirectUri: 'x', state: 's', scopes: PLAYBACK_SCOPES })
        )
        expect(url.searchParams.get('scope')).toBe(
            'user-read-playback-state user-modify-playback-state'
        )
    })

    it('shows the account dialog when connecting another account', () => {
        const url = new URL(
            authorizeUrl(client, { redirectUri: 'x', state: 's', showDialog: true })
        )
        expect(url.searchParams.get('show_dialog')).toBe('true')
    })
})

describe('allowsPlayback', () => {
    it('needs both playback scopes, in any order and among others', () => {
        expect(allowsPlayback('')).toBe(false)
        expect(allowsPlayback('user-read-playback-state')).toBe(false)
        expect(
            allowsPlayback(
                'playlist-read-private user-modify-playback-state user-read-playback-state'
            )
        ).toBe(true)
    })
})

describe('exchangeCode', () => {
    it('authenticates with the client secret and reads the tokens', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json({
                access_token: 'a',
                refresh_token: 'r',
                expires_in: 3600,
                scope: 'x'
            })
        )
        const result = await exchangeCode({ ...client, fetch: fetchMock }, 'code', 'uri')
        expect(result).toEqual({ accessToken: 'a', refreshToken: 'r', expiresIn: 3600, scope: 'x' })
        const [, init] = fetchMock.mock.calls[0]
        expect(init.headers.authorization).toBe(
            `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`
        )
    })

    it('does not leak the response into the error', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                Response.json({ error: 'invalid_grant', token: 'leak' }, { status: 400 })
            )
        const failure = exchangeCode({ ...client, fetch: fetchMock }, 'code', 'uri')
        await expect(failure).rejects.toBeInstanceOf(SpotifyError)
        await expect(failure).rejects.not.toThrow(/leak/)
    })
})

describe('getProfile', () => {
    it('picks the smallest image', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json({
                id: 'u',
                display_name: 'User',
                images: [
                    { url: 'big', width: 300 },
                    { url: 'small', width: 64 }
                ]
            })
        )
        expect(await getProfile('t', fetchMock)).toEqual({
            id: 'u',
            displayName: 'User',
            imageUrl: 'small'
        })
    })

    it('reports a 403 (not on the allowlist)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }))
        await expect(getProfile('t', fetchMock)).rejects.toMatchObject({ status: 403 })
    })
})
