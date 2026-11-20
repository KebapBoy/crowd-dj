import { error, json } from '@sveltejs/kit'
import { catalog } from '#lib/server/app.ts'
import { isSpotifyId } from '#lib/server/catalog.ts'
import { catalogCall, memberSession } from '#lib/server/guards.ts'
import { LINKS_MAX } from '#lib/spotify-links.ts'
import { m } from '#lib/paraglide/messages.js'
import type { RequestHandler } from './$types'

/**
 * `?ids=` (comma-separated): the tracks of pasted links, from the cache or looked up one at a time
 * with the host's token.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
    const { session, profile } = await memberSession(params.id, locals)
    const ids = (url.searchParams.get('ids') ?? '').split(',')
    if (ids.length > LINKS_MAX || !ids.every(isSpotifyId)) error(400, m.error_request())
    const tracks = await catalogCall(session.id, profile.id, (charge) =>
        catalog.tracks(session.hostId, ids, charge)
    )
    return json(tracks)
}
