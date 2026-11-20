import { error, isHttpError } from '@sveltejs/kit'
import { catalogRateLimit, sessions } from './app'
import { errorSummary } from './errors'
import type { Charge } from './catalog'
import { SpotifyError } from './spotify/oauth'
import { m } from '#lib/paraglide/messages.js'

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

/** The open session and the visitor's profile; visiting the session page joins it. */
export async function memberSession(id: string, locals: App.Locals) {
    const session = await openSession(id)
    if (!locals.profile) error(403, m.error_request())
    return { session, profile: locals.profile }
}

/**
 * Runs calls to Spotify for a participant of a session: the call charges what it is about to ask
 * Spotify against the limits per minute of the participant, the session and the instance, and
 * failures turn into errors with a text for them.
 */
export async function catalogCall<T>(
    sessionId: string,
    profileId: string,
    call: (charge: Charge) => Promise<T>
): Promise<T> {
    const charge: Charge = (calls) => {
        const keys = [`profile:${profileId}`, `session:${sessionId}`, 'all']
        if (calls > 0 && !catalogRateLimit(keys, calls)) error(429, m.catalog_too_many())
    }
    try {
        return await call(charge)
    } catch (caught) {
        if (isHttpError(caught)) throw caught
        console.error(errorSummary(caught))
        if (caught instanceof SpotifyError && caught.invalidGrant)
            error(503, m.catalog_host_signin())
        if (caught instanceof SpotifyError && caught.status === 429) error(503, m.catalog_busy())
        error(502, m.catalog_failed())
    }
}
