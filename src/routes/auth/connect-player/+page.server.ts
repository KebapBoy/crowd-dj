import { error } from '@sveltejs/kit'
import { startAuthorization } from '#lib/server/auth.ts'
import { m } from '#lib/paraglide/messages.js'
import type { PageServerLoad } from './$types'

/** A signed-in host connects (or swaps) their player: its tokens are stored, nobody signs in. */
export const load: PageServerLoad = ({ url, cookies, locals }) => {
    if (!locals.account) error(401, m.sign_in_required())
    return startAuthorization(url, cookies, 'player')
}
