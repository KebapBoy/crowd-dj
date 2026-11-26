import { redirect, type Cookies } from '@sveltejs/kit'
import { OAUTH_COOKIE, oauthClient } from './app'
import { randomToken } from './crypto'
import { authorizeUrl, INBOX_SCOPES, PLAYBACK_SCOPES } from './spotify/oauth'

/**
 * Why the browser goes to Spotify: a host signs in (no scope), a signed-in host connects their
 * player (the playback scopes), lets their own account play, or sets up an inbox (both with the
 * scopes their own account needs, see `ownScopes`).
 */
export type AuthPurpose = 'signin' | 'player' | 'playback' | 'inbox'

/**
 * The scopes a host's own account asks for: Spotify replaces the scopes of an account with those
 * of its latest authorization, so asking for one feature has to ask again for the others it uses.
 */
export function ownScopes({ playback, inbox }: { playback: boolean; inbox: boolean }): string[] {
    return [...(playback ? PLAYBACK_SCOPES : []), ...(inbox ? INBOX_SCOPES : [])]
}

/**
 * Remembers the purpose, a random state and the session it is for (an inbox for one session) in a
 * cookie and sends the browser to Spotify. Tokens and ids are base64url, so `:` separates them.
 */
export function startAuthorization(
    url: URL,
    cookies: Cookies,
    purpose: AuthPurpose,
    {
        showDialog = true,
        scopes = [],
        sessionId = ''
    }: { showDialog?: boolean; scopes?: readonly string[]; sessionId?: string } = {}
): never {
    const state = randomToken()
    cookies.set(OAUTH_COOKIE, `${purpose}:${state}:${sessionId}`, {
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
            scopes,
            // Shows which account signs in (with "Not you?"): after connecting a player, the browser
            // stays signed in to it at spotify.com, and the host's next sign-in would silently be the
            // player. Only right after a sign-in, when spotify.com is signed in to the host, can it
            // be left out
            showDialog
        }),
        { external: ['https://accounts.spotify.com'] }
    )
}
