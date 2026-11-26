import { fail } from '@sveltejs/kit'
import {
    inboxes,
    pools,
    poolsChanged,
    PROFILE_COOKIE,
    profiles,
    setProfileCookie
} from '#lib/server/app.ts'
import { isSpotifyId } from '#lib/server/catalog.ts'
import { mayChange, mayCreateProfile } from '#lib/server/guards.ts'
import { normalizeName, parseSpotifyUser } from '#lib/server/profiles.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
    const token = cookies.get(PROFILE_COOKIE)
    return {
        profile: locals.profile,
        // Signed in with Spotify: the name follows the account (hooks.server.ts)
        nameFromSpotify: locals.account !== null,
        // The cookie's token moves the profile to another device
        deviceLink: locals.profile && token ? `${url.origin}/p/${token}` : null,
        pool: locals.profile ? await pools.list(locals.profile.id) : []
    }
}

export const actions: Actions = {
    save: async ({ request, locals, cookies, getClientAddress }) => {
        if (locals.account) return fail(409, { error: m.error_request() })
        const name = normalizeName((await request.formData()).get('name'))
        if (!name) return fail(400, { invalid: true })
        if (locals.profile) {
            await profiles.rename(locals.profile.id, name)
            return { saved: true }
        }
        if (!mayCreateProfile(getClientAddress)) return fail(429, { tooManyProfiles: true })
        const { token } = await profiles.create(name)
        setProfileCookie(cookies, token)
        return { saved: true }
    },
    /** Links the profile to the Spotify user of a pasted profile link, for inbox playlists. */
    linkSpotify: async ({ request, locals }) => {
        // Signed in with Spotify: linked to the account (hooks.server.ts)
        if (!locals.profile || locals.account) return fail(409, { error: m.error_request() })
        if (!mayChange(locals.profile.id)) return fail(429, { error: m.session_too_many() })
        const userId = parseSpotifyUser((await request.formData()).get('spotify'))
        if (!userId) return fail(400, { spotifyInvalid: true })
        if (!(await profiles.linkSpotify(locals.profile.id, userId)))
            return fail(409, { error: m.profile_spotify_taken() })
        await poolsChanged(await inboxes.importFor(userId))
    },
    unlinkSpotify: async ({ locals }) => {
        if (!locals.profile || locals.account) return fail(409, { error: m.error_request() })
        await profiles.unlinkSpotify(locals.profile.id)
    },
    unpool: async ({ request, locals }) => {
        const trackId = (await request.formData()).get('track')
        if (!locals.profile || !isSpotifyId(trackId)) return fail(400, { error: m.error_request() })
        await pools.remove(locals.profile.id, trackId)
    }
}
