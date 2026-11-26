import { error, isHttpError } from '@sveltejs/kit'
import { actionRateLimit, catalogRateLimit, inboxes, profileRateLimit, sessions } from './app'
import { errorSummary } from './errors'
import { addressKey } from './rate-limit'
import type { Charge } from './catalog'
import { SpotifyError } from './spotify/oauth'
import { m } from '#lib/paraglide/messages.js'
import { getLocale } from '#lib/paraglide/runtime.js'

/** The open session of a link; an unknown or ended one is an error page. */
export async function openSession(id: string) {
    const session = await sessions.get(id)
    if (!session) error(404, m.session_not_found())
    if (session.endedAt) error(410, m.session_ended())
    return session
}

/** The open session, for its host only. */
export async function hostSession(id: string, locals: App.Locals) {
    const session = await openSession(id)
    if (session.hostId !== locals.account?.id) error(403, m.error_request())
    return session
}

/** The open session and the visitor's profile, which is in it (and has not left). */
export async function memberSession(id: string, locals: App.Locals) {
    const session = await openSession(id)
    if (!locals.profile) error(403, m.error_request())
    if ((await sessions.membership(session.id, locals.profile.id)) !== 'member')
        error(403, m.error_request())
    return { session, profile: locals.profile }
}

/**
 * A change by a participant (wish, pool, leave): limited per minute, since each one reloads every
 * open page of the session and may make the engine look at the player.
 */
export function mayChange(profileId: string): boolean {
    return actionRateLimit([`profile:${profileId}`])
}

let addressMissingLogged = false

/**
 * Whether the visitor may make another profile (`profileRateLimit`, IPv6 by its /64). Behind a
 * reverse proxy the address comes from the header that `ADDRESS_HEADER` names; when that header is
 * missing, adapter-node throws, and such requests share one address instead of failing.
 */
export function mayCreateProfile(getClientAddress: () => string): boolean {
    let address: string
    try {
        address = addressKey(getClientAddress())
    } catch (caught) {
        if (!addressMissingLogged) {
            addressMissingLogged = true
            console.warn(
                `No client address (${errorSummary(caught)}); check ADDRESS_HEADER and the reverse proxy`
            )
        }
        address = 'unknown'
    }
    return profileRateLimit([`address:${address}`])
}

/**
 * Creates the host's lasting inbox, or the inbox of their session, in their Spotify account (in
 * the visitor's language); failures turn into errors with a text for them.
 */
export async function createInbox(hostId: string, sessionId: string | null) {
    const playlist = sessionId
        ? {
              name: m.inbox_session_playlist_name({
                  date: new Date().toLocaleDateString(getLocale())
              }),
              description: m.inbox_session_playlist_description()
          }
        : { name: m.inbox_playlist_name(), description: m.inbox_playlist_description() }
    try {
        return await inboxes.create(hostId, sessionId, playlist)
    } catch (caught) {
        console.error(errorSummary(caught))
        if (caught instanceof SpotifyError && caught.invalidGrant)
            error(503, m.catalog_host_signin())
        if (caught instanceof SpotifyError && caught.status === 403)
            error(503, m.inbox_create_refused())
        error(502, m.inbox_create_failed())
    }
}

/**
 * Runs calls to Spotify for a participant of a session: the call charges what it is about to ask
 * Spotify against the limits per minute of the participant, the session, its host and the
 * instance, and failures turn into errors with a text for them.
 */
export async function catalogCall<T>(
    session: { id: string; hostId: string },
    profileId: string,
    call: (charge: Charge) => Promise<T>
): Promise<T> {
    const charge: Charge = (calls) => {
        const keys = [
            `profile:${profileId}`,
            `session:${session.id}`,
            `host:${session.hostId}`,
            'all'
        ]
        if (calls > 0 && !catalogRateLimit(keys, calls)) error(429, m.catalog_too_many())
    }
    try {
        return await call(charge)
    } catch (caught) {
        if (isHttpError(caught)) throw caught
        console.error(errorSummary(caught))
        if (caught instanceof SpotifyError && caught.invalidGrant)
            error(503, m.catalog_host_signin())
        // In development mode Spotify answers 403 for accounts that are not on the app's allowlist
        if (caught instanceof SpotifyError && caught.status === 403)
            error(503, m.catalog_host_refused())
        if (caught instanceof SpotifyError && caught.status === 429) error(503, m.catalog_busy())
        error(502, m.catalog_failed())
    }
}
