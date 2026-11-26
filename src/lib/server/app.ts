import type { Cookies } from '@sveltejs/kit'
import { createAccounts } from './accounts'
import { createCatalog } from './catalog'
import { tokenKey } from './crypto'
import { db } from './db'
import { createEngine } from './engine'
import { createEvents } from './events'
import { createInboxes } from './inboxes'
import { createPicker } from './picker'
import { createPlayingView } from './playing'
import { createPools } from './pools'
import { createProfiles } from './profiles'
import { createRateLimit } from './rate-limit'
import { createSessions } from './sessions'
import { createSkips } from './skips'
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

/** Spotify's Web API with the tokens of the connected accounts; one, so a 429 pauses every call. */
const spotify = createSpotifyApi({ tokens: accounts })

/** Spotify's catalog through the hosts' tokens, with the track cache. */
export const catalog = createCatalog({ db, api: spotify })

/** Participants' pools, kept across sessions. */
export const pools = createPools({ db })

/** Wishes in sessions. */
export const wishes = createWishes({ db })

/** Tells the open pages of a session that something changed. */
export const events = createEvents()

const picker = createPicker({ db })

/** Who may skip the track that plays, and the votes to skip it. */
export const skips = createSkips({
    db,
    // Participants with the session open (their live updates); the host's pages are not one's
    present: (sessionId) =>
        new Set(
            [...events.present(sessionId)]
                .filter((key) => key.startsWith('profile:'))
                .map((key) => key.slice('profile:'.length))
        )
})

/** Picks the next track of a session and plays it through the playing account. */
export const engine = createEngine({
    db,
    api: spotify,
    sessions,
    picker,
    events,
    votesReached: skips.reached
})

/** "Now playing" and "up next" of a session, as its pages show them. */
export const playing = createPlayingView({
    db,
    picker,
    skips,
    live: (sessionId) => engine.live(sessionId)
})

/**
 * Something in the session changed that its pages show and that may change what plays next (a
 * wish, a pool, someone joined or left, the settings).
 */
export function sessionChanged(sessionId: string) {
    events.publish(sessionId)
    engine.poke(sessionId)
}

/** Inbox playlists of the hosts, whose tracks land in the pools of the people who added them. */
export const inboxes = createInboxes({ db, api: spotify, catalog })

/** The pools of these profiles changed: every open session they are in may play differently. */
export async function poolsChanged(profileIds: Iterable<string>) {
    for (const id of await sessions.openWith([...profileIds])) sessionChanged(id)
}

/** Looks at the inboxes of hosts with an open session and tells the sessions what changed. */
export async function syncInboxes() {
    const result = await inboxes.syncOpen()
    await poolsChanged(result.profiles)
    // A session's inbox is gone: its pages stop showing it
    for (const id of result.sessions) events.publish(id)
}

/**
 * Calls to Spotify per minute that participants may cause (searches, albums, links not cached yet):
 * each one, everyone in a session together (profiles are free to make), all sessions of a host (who
 * could start new ones), and everyone on this instance, so nobody uses up the quota the hosts'
 * accounts share. Once the instance's limit ran out, hosts whose sessions used less than an equal
 * share of it go on, so someone in two sessions cannot use it up for everyone else. Shared among
 * hosts, not sessions: the allowlist keeps them few, while a host could start session after session.
 */
export const catalogRateLimit = createRateLimit({
    limits: { profile: 100, session: 150, host: 150, all: 300 },
    shares: { all: 'host' },
    windowMs: 60 * 1000
})

/** Changes per minute a participant may make in sessions (wishes, pools, votes, skips, leaving). */
export const actionRateLimit = createRateLimit({ limits: { profile: 60 }, windowMs: 60 * 1000 })

/**
 * Skips per minute in a session, by the host and participants together: each one costs a few calls
 * to Spotify on the quota the hosts share, and nobody needs more to get past a few tracks.
 */
export const skipRateLimit = createRateLimit({ limits: { session: 10 }, windowMs: 60 * 1000 })

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
