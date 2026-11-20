import { error, json } from '@sveltejs/kit'
import { catalog } from '#lib/server/app.ts'
import { catalogCall, memberSession } from '#lib/server/guards.ts'
import { m } from '#lib/paraglide/messages.js'
import type { RequestHandler } from './$types'

/** An album with its tracks, looked up with the host's token. */
export const GET: RequestHandler = async ({ params, locals }) => {
    const { session, profile } = await memberSession(params.id, locals)
    const album = await catalogCall(session.id, profile.id, (charge) =>
        catalog.album(session.hostId, params.albumId, charge)
    )
    if (!album) error(404, m.catalog_not_found())
    return json(album)
}
