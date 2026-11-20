import { fail } from '@sveltejs/kit'
import { pools, PROFILE_COOKIE, profiles, setProfileCookie } from '#lib/server/app.ts'
import { isSpotifyId } from '#lib/server/catalog.ts'
import { normalizeName } from '#lib/server/profiles.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
    const token = cookies.get(PROFILE_COOKIE)
    return {
        profile: locals.profile,
        // The cookie's token moves the profile to another device
        deviceLink: locals.profile && token ? `${url.origin}/p/${token}` : null,
        pool: locals.profile ? await pools.list(locals.profile.id) : []
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
    },
    unpool: async ({ request, locals }) => {
        const trackId = (await request.formData()).get('track')
        if (!locals.profile || !isSpotifyId(trackId)) return fail(400, { error: m.error_request() })
        await pools.remove(locals.profile.id, trackId)
    }
}
