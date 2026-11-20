import { error, fail, redirect } from '@sveltejs/kit'
import { accounts, sessions } from '#lib/server/app.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => ({
    account: locals.account,
    profile: locals.profile,
    openSession: locals.account
        ? ((await sessions.openOfHost(locals.account.id))?.id ?? null)
        : null
})

export const actions: Actions = {
    /** Starts the host's session, or opens the one that is running. */
    startSession: async ({ locals }) => {
        const host = locals.account
        if (!host) error(401, m.sign_in_required())
        // The session plays through the player, else the host: that sign-in has to work
        const playing = (await accounts.player(host.id)) ?? host
        if (playing.tokenStatus === 'expired' || playing.tokenStatus === 'revoked')
            return fail(409, {
                startError: m.session_start_expired({ name: playing.displayName ?? playing.id })
            })
        const session = await sessions.start(host.id)
        redirect(303, `/s/${session.id}`)
    }
}
