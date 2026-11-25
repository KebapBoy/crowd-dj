import { error, json } from '@sveltejs/kit'
import { catalog } from '#lib/server/app.ts'
import { catalogCall, memberSession } from '#lib/server/guards.ts'
import { m } from '#lib/paraglide/messages.js'
import type { RequestHandler } from './$types'

/** `?offset=`: a page of an artist's albums, looked up with the host's token. */
export const GET: RequestHandler = async ({ params, url, locals }) => {
    const { session, profile } = await memberSession(params.id, locals)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000) error(400, m.error_request())
    const page = await catalogCall(session, profile.id, (charge) =>
        catalog.artistAlbums(session.hostId, params.artistId, offset, charge)
    )
    if (!page) error(404, m.catalog_not_found())
    return json(page)
}
