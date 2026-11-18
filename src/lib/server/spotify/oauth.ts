/**
 * Spotify's authorization code flow and the profile of the signed-in user. Pure HTTP: storing the
 * tokens is the job of `accounts.ts`.
 */

const ACCOUNTS = 'https://accounts.spotify.com'
const API = 'https://api.spotify.com/v1'

/**
 * Everything crowd-dj will need, asked for at once so hosts consent only once: playback state and
 * control for the session engine, private and collaborative playlists for the inbox playlists.
 */
export const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-private'
] as const

export interface OAuthClient {
    clientId: string
    clientSecret: string
    fetch?: typeof fetch
}

export interface TokenResponse {
    accessToken: string
    /** Spotify may leave it out on a refresh; then the old one stays valid. */
    refreshToken?: string
    expiresIn: number
    scope: string
}

export interface SpotifyProfile {
    id: string
    displayName: string | null
    imageUrl: string | null
}

/** A failed call to Spotify. `invalidGrant` means the refresh token is no longer valid. */
export class SpotifyError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly invalidGrant = false
    ) {
        super(message)
        this.name = 'SpotifyError'
    }
}

export function authorizeUrl(
    client: OAuthClient,
    options: { redirectUri: string; state: string; showDialog?: boolean }
): string {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: client.clientId,
        scope: SCOPES.join(' '),
        redirect_uri: options.redirectUri,
        state: options.state
    })
    // Shows "Not you?" so another account than the one signed in at spotify.com can be connected
    if (options.showDialog) params.set('show_dialog', 'true')
    return `${ACCOUNTS}/authorize?${params}`
}

async function tokenRequest(client: OAuthClient, body: Record<string, string>) {
    const response = await (client.fetch ?? fetch)(`${ACCOUNTS}/api/token`, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams(body)
    })
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
        // Never put the response into the message as it is: it might echo a token
        const code = typeof json.error === 'string' ? json.error : 'unknown_error'
        throw new SpotifyError(
            `Spotify token request failed: ${response.status} ${code}`,
            response.status,
            code === 'invalid_grant'
        )
    }
    return {
        accessToken: String(json.access_token),
        refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
        expiresIn: Number(json.expires_in) || 3600,
        scope: typeof json.scope === 'string' ? json.scope : ''
    } satisfies TokenResponse
}

export function exchangeCode(
    client: OAuthClient,
    code: string,
    redirectUri: string
): Promise<TokenResponse> {
    return tokenRequest(client, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
    })
}

export function refreshAccessToken(
    client: OAuthClient,
    refreshToken: string
): Promise<TokenResponse> {
    return tokenRequest(client, { grant_type: 'refresh_token', refresh_token: refreshToken })
}

/** `GET /me`. A 403 here usually means the user is not on the app's allowlist. */
export async function getProfile(
    accessToken: string,
    fetchFn: typeof fetch = fetch
): Promise<SpotifyProfile> {
    const response = await fetchFn(`${API}/me`, {
        headers: { authorization: `Bearer ${accessToken}` }
    })
    if (!response.ok)
        throw new SpotifyError(`Spotify GET /me failed: ${response.status}`, response.status)
    const json = (await response.json()) as {
        id: string
        display_name?: string | null
        images?: { url: string; width?: number | null }[]
    }
    // The smallest image is enough for an avatar
    const images = [...(json.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
    return {
        id: json.id,
        displayName: json.display_name || null,
        imageUrl: images[0]?.url ?? null
    }
}
