import { error } from '@sveltejs/kit'
import { ownScopes, startAuthorization } from '#lib/server/auth.ts'
import { m } from '#lib/paraglide/messages.js'
import type { PageServerLoad } from './$types'

/**
 * A signed-in host lets their own account hold inbox playlists, and crowd-dj creates one: the
 * host's lasting inbox, or one for the session in `?session=`.
 */
export const load: PageServerLoad = ({ url, cookies, locals }) => {
    if (!locals.account) error(401, m.sign_in_required())
    const sessionId = url.searchParams.get('session') ?? ''
    if (!/^[0-9A-Za-z_-]{0,64}$/.test(sessionId)) error(400, m.error_request())
    return startAuthorization(url, cookies, 'inbox', {
        scopes: ownScopes({ playback: locals.account.allowsPlayback, inbox: true }),
        sessionId
    })
}
