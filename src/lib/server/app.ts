import { createAccounts } from './accounts'
import { tokenKey } from './crypto'
import { db } from './db'
import { APP_SECRET, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from '$app/env/private'

/** The Spotify app crowd-dj signs in with. */
export const oauthClient = { clientId: SPOTIFY_CLIENT_ID, clientSecret: SPOTIFY_CLIENT_SECRET }

/** Connected Spotify accounts and sign-ins, backed by the app's database. */
export const accounts = createAccounts({
    db,
    key: tokenKey(APP_SECRET),
    client: oauthClient
})

/** Cookie with the sign-in token of a host. */
export const LOGIN_COOKIE = 'crowd_dj_login'
/** Cookie with the OAuth state while the browser is at Spotify. */
export const OAUTH_COOKIE = 'crowd_dj_oauth'
