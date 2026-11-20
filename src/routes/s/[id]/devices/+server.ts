import { error, json } from '@sveltejs/kit'
import { accounts, engine } from '#lib/server/app.ts'
import { hostSession } from '#lib/server/guards.ts'
import { accountName, problemMessage } from '#lib/playing-messages.ts'
import type { RequestHandler } from './$types'

/** The devices the session's playing account can play on; for the host only. */
export const GET: RequestHandler = async ({ params, locals }) => {
    const session = await hostSession(params.id, locals)
    const devices = await engine.devices(session)
    if (typeof devices === 'string') {
        const playing =
            (await accounts.player(session.hostId)) ?? (await accounts.get(session.hostId))
        error(devices === 'busy' ? 503 : 502, problemMessage(devices, accountName(playing)))
    }
    // Devices without an ID cannot be controlled through the API: shown, but not selectable
    return json(devices)
}
