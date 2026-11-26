import { error } from '@sveltejs/kit'
import { ownScopes, startAuthorization } from '#lib/server/auth.ts'
import { m } from '#lib/paraglide/messages.js'
import type { PageServerLoad } from './$types'

/** A signed-in host lets their own account play their sessions (when no player plays them). */
export const load: PageServerLoad = ({ url, cookies, locals }) => {
    if (!locals.account) error(401, m.sign_in_required())
    return startAuthorization(url, cookies, 'playback', {
        scopes: ownScopes({ playback: true, inbox: locals.account.allowsInbox })
    })
}
