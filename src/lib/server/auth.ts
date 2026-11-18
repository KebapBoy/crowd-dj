import { redirect, type Cookies } from '@sveltejs/kit'
import { OAUTH_COOKIE, oauthClient } from './app'
import { randomToken } from './crypto'
import { authorizeUrl } from './spotify/oauth'

/** Why the browser goes to Spotify: to sign in, or (admin only) to connect the room account. */
export type AuthPurpose = 'signin' | 'room'

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
            // Always show which account signs in (with "Not you?"): after connecting the room account, the
            // browser stays signed in to it at spotify.com, and the admin's next sign-in would silently be
            // the room account
            showDialog: true
        }),
        { external: ['https://accounts.spotify.com'] }
    )
}
