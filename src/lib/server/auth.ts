import { redirect, type Cookies } from '@sveltejs/kit'
import { OAUTH_COOKIE, oauthClient } from './app'
import { randomToken } from './crypto'
import { authorizeUrl } from './spotify/oauth'

/** Why the browser goes to Spotify: a host signs in, or a signed-in host connects their player. */
export type AuthPurpose = 'signin' | 'player'

/** Remembers the purpose and a random state in a cookie and sends the browser to Spotify. */
export function startAuthorization(url: URL, cookies: Cookies, purpose: AuthPurpose): never {
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
            // Always show which account signs in (with "Not you?"): after connecting a player, the browser
            // stays signed in to it at spotify.com, and the host's next sign-in would silently be the player
            showDialog: true
        }),
        { external: ['https://accounts.spotify.com'] }
    )
}
