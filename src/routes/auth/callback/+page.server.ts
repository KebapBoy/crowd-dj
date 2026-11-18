import { error, redirect } from '@sveltejs/kit'
import { accounts, LOGIN_COOKIE, OAUTH_COOKIE, oauthClient } from '#lib/server/app.ts'
import { errorSummary } from '#lib/server/errors.ts'
import { exchangeCode, getProfile, SpotifyError } from '#lib/server/spotify/oauth.ts'
import { m } from '#lib/paraglide/messages.js'
import type { PageServerLoad } from './$types'

/** Spotify sends the browser back here after a sign-in or after connecting the room account. */
export const load: PageServerLoad = async ({ url, cookies, locals }) => {
    const [purpose, expectedState] = (cookies.get(OAUTH_COOKIE) ?? '').split(':')
    cookies.delete(OAUTH_COOKIE, { path: '/auth' })

    const state = url.searchParams.get('state')
    if (!expectedState || state !== expectedState) error(400, m.auth_state_mismatch())
    if (url.searchParams.get('error')) error(400, m.auth_cancelled())
    const code = url.searchParams.get('code')
    if (!code) error(400, m.auth_cancelled())
    if (purpose === 'room' && !locals.account?.isAdmin) error(403, m.admin_only())

    let tokens, profile
    try {
        tokens = await exchangeCode(oauthClient, code, `${url.origin}/auth/callback`)
        profile = await getProfile(tokens.accessToken)
    } catch (cause) {
        // 403 from GET /me: the account is not on the Spotify app's allowlist
        if (cause instanceof SpotifyError && cause.status === 403)
            error(403, m.auth_not_allowlisted())
        console.error('Spotify sign-in failed:', errorSummary(cause))
        error(502, m.auth_failed())
    }

    const existing = await accounts.get(profile.id)
    if (purpose === 'room') {
        // Usually the admin forgot to pick "Not you?" in Spotify's dialog
        if (existing?.isAdmin || existing?.approved) error(409, m.auth_room_is_host())
        await accounts.saveAuthorization(tokens, profile)
        await accounts.replaceRoomAccount(profile.id)
        redirect(303, '/admin')
    }

    // Nobody signs in as the room account: it plays for everyone and is managed on the admin page
    if (existing?.isRoom) error(409, m.auth_is_room_account())
    await accounts.saveAuthorization(tokens, profile)

    const previous = cookies.get(LOGIN_COOKIE)
    if (previous) await accounts.deleteLogin(previous)
    const login = await accounts.createLogin(profile.id)
    cookies.set(LOGIN_COOKIE, login.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        expires: login.expiresAt
    })
    redirect(303, (await accounts.get(profile.id))?.isAdmin ? '/admin' : '/')
}
