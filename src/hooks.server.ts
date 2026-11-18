import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks'
import { sequence } from '@sveltejs/kit/hooks'
import { accounts, LOGIN_COOKIE } from '#lib/server/app.ts'
import { db } from '#lib/server/db/index.ts'
import { migrateDatabase } from '#lib/server/db/migrate.ts'
import { errorSummary } from '#lib/server/errors.ts'
import { m } from '#lib/paraglide/messages.js'
import { getTextDirection } from '#lib/paraglide/runtime.js'
import { paraglideMiddleware } from '#lib/paraglide/server.js'

/** Brings the database up to date before the first request. */
export const init: ServerInit = async () => {
    await migrateDatabase(db)
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
    event.locals.account = token ? await accounts.accountForLogin(token) : null
    if (token && !event.locals.account) event.cookies.delete(LOGIN_COOKIE, { path: '/' })
    return resolve(event)
}

export const handle: Handle = sequence(handleLogin, handleParaglide)

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
