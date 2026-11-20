import type { Cookies } from '@sveltejs/kit'
import { createAccounts } from './accounts'
import { tokenKey } from './crypto'
import { db } from './db'
import { createProfiles } from './profiles'
import { createSessions } from './sessions'
import { APP_SECRET, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from '$app/env/private'

/** The Spotify app crowd-dj signs in with. */
export const oauthClient = { clientId: SPOTIFY_CLIENT_ID, clientSecret: SPOTIFY_CLIENT_SECRET }

/** Connected Spotify accounts and sign-ins, backed by the app's database. */
export const accounts = createAccounts({
    db,
    key: tokenKey(APP_SECRET),
    client: oauthClient
})

/** Participant profiles, one per person, in a cookie per browser. */
export const profiles = createProfiles({ db })

/** Sessions of the hosts. */
export const sessions = createSessions({ db })

/** Cookie with the sign-in token of a host. */
export const LOGIN_COOKIE = 'crowd_dj_login'
/** Cookie with the token of the participant profile. */
export const PROFILE_COOKIE = 'crowd_dj_profile'
/** Cookie with the OAuth state while the browser is at Spotify. */
export const OAUTH_COOKIE = 'crowd_dj_oauth'

/** Keeps a participant's profile in this browser for as long as browsers allow (400 days). */
export function setProfileCookie(cookies: Cookies, token: string) {
    cookies.set(PROFILE_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 400 * 24 * 60 * 60
    })
}
