import { fail } from '@sveltejs/kit'
import { PROFILE_COOKIE, profiles, setProfileCookie } from '#lib/server/app.ts'
import { normalizeName } from '#lib/server/profiles.ts'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = ({ locals, cookies, url }) => {
    const token = cookies.get(PROFILE_COOKIE)
    return {
        profile: locals.profile,
        // The cookie's token moves the profile to another device
        deviceLink: locals.profile && token ? `${url.origin}/p/${token}` : null
    }
}

export const actions: Actions = {
    save: async ({ request, locals, cookies }) => {
        const name = normalizeName((await request.formData()).get('name'))
        if (!name) return fail(400, { invalid: true })
        if (locals.profile) {
            await profiles.rename(locals.profile.id, name)
            return { saved: true }
        }
        const { token } = await profiles.create(name)
        setProfileCookie(cookies, token)
        return { saved: true }
    }
}
