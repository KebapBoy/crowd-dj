import { redirect } from '@sveltejs/kit'
import { accounts, LOGIN_COOKIE, profiles } from '#lib/server/app.ts'
import type { RequestHandler } from './$types'

/**
 * Signs this browser out (the stored Spotify tokens stay, so sessions keep playing). Its profile
 * lets go of the account's link to inbox tracks, which another signed-in device can then take.
 */
export const POST: RequestHandler = async ({ cookies, locals }) => {
    const token = cookies.get(LOGIN_COOKIE)
    if (token) await accounts.deleteLogin(token)
    if (locals.account && locals.profile)
        await profiles.releaseSpotify(locals.profile.id, locals.account.id)
    cookies.delete(LOGIN_COOKIE, { path: '/' })
    redirect(303, '/')
}
