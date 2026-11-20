import { error, redirect } from '@sveltejs/kit'
import { profiles, setProfileCookie } from '#lib/server/app.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad } from './$types'

/**
 * A personal link that moves a profile to this device. It asks first, so a link preview in a chat
 * or an accidental scan does not replace the profile a device uses.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
    const profile = await profiles.forToken(params.token)
    if (!profile) error(404, m.profile_link_invalid())
    return {
        name: profile.name,
        current: locals.profile,
        same: locals.profile?.id === profile.id,
        // A browser signed in with Spotify keeps the profile named after the account
        signedIn: locals.account !== null
    }
}

export const actions: Actions = {
    default: async ({ params, cookies, locals }) => {
        if (!(await profiles.forToken(params.token))) error(404, m.profile_link_invalid())
        if (locals.account) error(409, m.profile_link_signed_in())
        setProfileCookie(cookies, params.token)
        redirect(303, '/profile')
    }
}
