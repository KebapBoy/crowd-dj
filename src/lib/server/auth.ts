import { redirect, type Cookies } from '@sveltejs/kit'
import { OAUTH_COOKIE, oauthClient } from './app'
import { randomToken } from './crypto'
import { authorizeUrl, PLAYBACK_SCOPES } from './spotify/oauth'

/**
 * Why the browser goes to Spotify: a host signs in (no scope), a signed-in host connects their
 * player, or a signed-in host lets their own account play (both with the playback scopes).
 */
export type AuthPurpose = 'signin' | 'player' | 'playback'

/** Remembers the purpose and a random state in a cookie and sends the browser to Spotify. */
export function startAuthorization(
    url: URL,
    cookies: Cookies,
    purpose: AuthPurpose,
    { showDialog = true } = {}
): never {
    const state = randomToken()
    cookies.set(OAUTH_COOKIE, `${purpose}:${state}`, {
        path: '/auth',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 10 * 60
    })
    redirect(
        303,
        authorizeUrl(oauthClient, {
            redirectUri: `${url.origin}/auth/callback`,
            state,
            scopes: purpose === 'signin' ? [] : PLAYBACK_SCOPES,
            // Shows which account signs in (with "Not you?"): after connecting a player, the browser
            // stays signed in to it at spotify.com, and the host's next sign-in would silently be the
            // player. Only right after a sign-in, when spotify.com is signed in to the host, can it
            // be left out
            showDialog
        }),
        { external: ['https://accounts.spotify.com'] }
    )
}
