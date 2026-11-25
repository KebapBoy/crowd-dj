import { error, redirect } from '@sveltejs/kit'
import { accounts, LOGIN_COOKIE, OAUTH_COOKIE, oauthClient } from '#lib/server/app.ts'
import { startAuthorization } from '#lib/server/auth.ts'
import { errorSummary } from '#lib/server/errors.ts'
import { exchangeCode, getProfile, SpotifyError } from '#lib/server/spotify/oauth.ts'
import { m } from '#lib/paraglide/messages.js'
import type { PageServerLoad } from './$types'

/** Spotify sends the browser back here after a host signed in or connected their player. */
export const load: PageServerLoad = async ({ url, cookies, locals }) => {
    const [purpose, expectedState] = (cookies.get(OAUTH_COOKIE) ?? '').split(':')
    cookies.delete(OAUTH_COOKIE, { path: '/auth' })

    const state = url.searchParams.get('state')
    if (!expectedState || state !== expectedState) error(400, m.auth_state_mismatch())
    if (url.searchParams.get('error')) error(400, m.auth_cancelled())
    const code = url.searchParams.get('code')
    if (!code) error(400, m.auth_cancelled())
    const host = locals.account
    if ((purpose === 'player' || purpose === 'playback') && !host) error(401, m.sign_in_required())

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

    if (purpose === 'player' && host) {
        // Usually the host forgot to pick "Not you?" in Spotify's dialog
        const problem = await accounts.connectPlayer(host.id, tokens, profile)
        if (problem === 'self') error(409, m.auth_player_is_self())
        if (problem === 'taken') error(409, m.auth_player_taken())
        if (problem) error(409, m.auth_player_is_host())
        redirect(303, '/account')
    }

    // A player plays for its host and does not sign in itself
    if (purpose === 'playback' && host) {
        // The browser is signed in to another account at spotify.com, e.g. the player
        if (profile.id !== host.id) error(409, m.auth_playback_not_self())
        if (!(await accounts.saveAuthorization(tokens, profile))) error(409, m.auth_is_player())
        redirect(303, '/account')
    }

    // A host whose own account plays keeps that: the sign-in asks for no scope, so it goes on to
    // Spotify once more for the playback scopes, which Spotify grants without asking again. Should
    // that fail, "My account" offers to allow playback
    const existing = await accounts.get(profile.id)
    const playsItself = existing?.allowsPlayback && !(await accounts.player(profile.id))
    if (!(await accounts.saveAuthorization(tokens, profile))) error(409, m.auth_is_player())

    const previous = cookies.get(LOGIN_COOKIE)
    if (previous) await accounts.deleteLogin(previous)
    const login = await accounts.createLogin(profile.id)
    cookies.set(LOGIN_COOKIE, login.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        expires: login.expiresAt
    })
    if (playsItself) startAuthorization(url, cookies, 'playback', { showDialog: false })
    redirect(303, '/account')
}
