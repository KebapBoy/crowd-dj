import { redirect } from '@sveltejs/kit'
import { accounts, LOGIN_COOKIE } from '#lib/server/app.ts'
import type { RequestHandler } from './$types'

/** Signs this browser out (the stored Spotify tokens stay, so sessions keep playing). */
export const POST: RequestHandler = async ({ cookies }) => {
    const token = cookies.get(LOGIN_COOKIE)
    if (token) await accounts.deleteLogin(token)
    cookies.delete(LOGIN_COOKIE, { path: '/' })
    redirect(303, '/')
}
