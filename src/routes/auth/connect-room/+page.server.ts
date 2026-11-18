import { error } from '@sveltejs/kit'
import { startAuthorization } from '#lib/server/auth.ts'
import { m } from '#lib/paraglide/messages.js'
import type { PageServerLoad } from './$types'

/** The admin connects (or swaps) the room account: its tokens are stored, nobody is signed in. */
export const load: PageServerLoad = ({ url, cookies, locals }) => {
    if (!locals.account?.isAdmin) error(403, m.admin_only())
    return startAuthorization(url, cookies, 'room')
}
