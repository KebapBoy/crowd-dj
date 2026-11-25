import { error, json } from '@sveltejs/kit'
import { catalog } from '#lib/server/app.ts'
import { QUERY_MAX_LENGTH } from '#lib/limits.ts'
import { catalogCall, memberSession } from '#lib/server/guards.ts'
import { m } from '#lib/paraglide/messages.js'
import type { RequestHandler } from './$types'

/** `?q=`: tracks, albums and artists, searched with the host's token. */
export const GET: RequestHandler = async ({ params, url, locals }) => {
    const { session, profile } = await memberSession(params.id, locals)
    const query = (url.searchParams.get('q') ?? '').trim()
    if (!query || query.length > QUERY_MAX_LENGTH) error(400, m.error_request())
    return json(
        await catalogCall(session, profile.id, (charge) =>
            catalog.search(session.hostId, query, charge)
        )
    )
}
