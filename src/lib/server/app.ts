import type { Cookies } from '@sveltejs/kit'
import { createAccounts } from './accounts'
import { createCatalog } from './catalog'
import { tokenKey } from './crypto'
import { db } from './db'
import { createPools } from './pools'
import { createProfiles } from './profiles'
import { createRateLimit } from './rate-limit'
import { createSessions } from './sessions'
import { createSpotifyApi } from './spotify/api'
import { createWishes } from './wishes'
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

/** Spotify's catalog through the hosts' tokens, with the track cache. */
export const catalog = createCatalog({ db, api: createSpotifyApi({ tokens: accounts }) })

/** Participants' pools, kept across sessions. */
export const pools = createPools({ db })

/** Wishes in sessions. */
export const wishes = createWishes({ db })

/**
 * Calls to Spotify per minute that participants may cause (searches, albums, links not cached yet):
 * each one, everyone in a session together (profiles are free to make), and everyone on this
 * instance, so nobody uses up the quota the hosts' accounts share.
 */
export const catalogRateLimit = createRateLimit({
    limits: { profile: 100, session: 150, all: 300 },
    windowMs: 60 * 1000
})

/**
 * New participant profiles per hour from one client address (a room behind one router shares it,
 * so generously). Profiles are free to make and would otherwise fill the database or multiply the
 * limits per profile. No limit for the whole instance: a few addresses could use it up and keep
 * everyone from joining.
 */
export const profileRateLimit = createRateLimit({
    limits: { address: 30 },
    windowMs: 60 * 60 * 1000
})

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
