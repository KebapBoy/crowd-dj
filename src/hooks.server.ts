import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks'
import { sequence } from '@sveltejs/kit/hooks'
import {
    accounts,
    engine,
    inboxes,
    LOGIN_COOKIE,
    poolsChanged,
    PROFILE_COOKIE,
    profiles,
    sessions,
    setProfileCookie,
    syncInboxes
} from '#lib/server/app.ts'
import { INBOX_SYNC_MS } from '#lib/server/inboxes.ts'
import { mayCreateProfile } from '#lib/server/guards.ts'
import { spotifyProfileName } from '#lib/server/profiles.ts'
import { db } from '#lib/server/db/index.ts'
import { migrateDatabase } from '#lib/server/db/migrate.ts'
import { errorSummary } from '#lib/server/errors.ts'
import { m } from '#lib/paraglide/messages.js'
import { getTextDirection } from '#lib/paraglide/runtime.js'
import { paraglideMiddleware } from '#lib/paraglide/server.js'

/** How often idle sessions are ended. */
const IDLE_CHECK_MS = 60 * 1000

/**
 * Brings the database up to date before the first request, starts ending idle sessions and picks
 * up the sessions that were playing.
 */
export const init: ServerInit = async () => {
    await migrateDatabase(db)
    await engine.start()
    setInterval(() => {
        sessions.endIdle().catch((error) => console.error(errorSummary(error)))
    }, IDLE_CHECK_MS).unref()
    setInterval(() => {
        syncInboxes().catch((error) => console.error(errorSummary(error)))
    }, INBOX_SYNC_MS).unref()
}

const handleParaglide: Handle = ({ event, resolve }) =>
    paraglideMiddleware(event.request, ({ request, locale }) => {
        return resolve(
            { ...event, request },
            {
                transformPageChunk: ({ html }) =>
                    html
                        .replace('%paraglide.lang%', locale)
                        .replace('%paraglide.dir%', getTextDirection(locale))
            }
        )
    })

/** The Spotify account this browser is signed in with (hosts only). */
const handleLogin: Handle = async ({ event, resolve }) => {
    const token = event.cookies.get(LOGIN_COOKIE)
    const login = token ? await accounts.login(token) : null
    event.locals.account = login?.account ?? null
    event.locals.loginExpiresAt = login?.expiresAt ?? null
    if (token && !event.locals.account) event.cookies.delete(LOGIN_COOKIE, { path: '/' })
    return resolve(event)
}

/**
 * The participant profile of this browser. A browser signed in with Spotify always has one, named
 * after the account (`spotifyProfileName`); it is made here (within the limit of new profiles per
 * address) and follows the Spotify name.
 */
const handleProfile: Handle = async ({ event, resolve }) => {
    const { cookies, locals } = event
    const token = cookies.get(PROFILE_COOKIE)
    locals.profile = token ? await profiles.forToken(token) : null
    if (token && !locals.profile) cookies.delete(PROFILE_COOKIE, { path: '/' })
    if (locals.account) {
        const name = spotifyProfileName(locals.account)
        if (!locals.profile && mayCreateProfile(event.getClientAddress)) {
            const created = await profiles.create(name)
            setProfileCookie(cookies, created.token)
            locals.profile = created.profile
        } else if (locals.profile && locals.profile.name !== name) {
            await profiles.rename(locals.profile.id, name)
            locals.profile = { ...locals.profile, name }
        }
        // The sign-in proves who it is, until it expires: tracks the account adds to inboxes land
        // in this pool, unless the profile of another device signed in to it has them already
        const userId = locals.account.id
        const until = locals.loginExpiresAt
        const { profile } = locals
        const vouched =
            profile?.spotifyUserId === userId &&
            !!profile.spotifyVerifiedUntil &&
            !!until &&
            profile.spotifyVerifiedUntil >= until
        if (
            profile &&
            until &&
            !vouched &&
            (await profiles.claimSpotify(profile.id, userId, until))
        ) {
            locals.profile = { ...profile, spotifyUserId: userId, spotifyVerifiedUntil: until }
            if (profile.spotifyUserId !== userId)
                await poolsChanged(await inboxes.importFor(userId))
        }
    }
    return resolve(event)
}

export const handle: Handle = sequence(handleLogin, handleProfile, handleParaglide)

/**
 * Errors thrown with error() already carry a translated text. SvelteKit's own (404 and the like)
 * get one here; unexpected ones are logged without query parameters or tokens.
 */
export const handleError: HandleServerError = (caught) => {
    if (caught.kind === 'app') return
    if (caught.kind === 'unknown') {
        const { error } = caught
        const stack =
            error instanceof Error ? (error.stack?.split('\n').slice(1, 6).join('\n') ?? '') : ''
        console.error(errorSummary(error), stack)
        return { message: m.error_internal() }
    }
    return { message: caught.error.status === 404 ? m.error_not_found() : m.error_request() }
}
