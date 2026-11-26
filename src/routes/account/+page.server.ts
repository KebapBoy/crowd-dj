import { error, fail, redirect } from '@sveltejs/kit'
import { accounts, inboxes, LOGIN_COOKIE, profiles } from '#lib/server/app.ts'
import { createInbox } from '#lib/server/guards.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad } from './$types'

function requireHost(locals: App.Locals) {
    if (!locals.account) error(401, m.sign_in_required())
    return locals.account
}

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.account) return { host: null, player: null, inbox: null }
    return {
        host: locals.account,
        player: await accounts.player(locals.account.id),
        inbox: await inboxes.lasting(locals.account.id)
    }
}

export const actions: Actions = {
    removePlayer: async ({ locals }) => {
        await accounts.removePlayer(requireHost(locals).id)
    },
    deleteAccount: async ({ locals, cookies }) => {
        const host = requireHost(locals)
        await accounts.removeHost(host.id)
        // No profile keeps getting the inbox tracks of an account that is gone
        await profiles.releaseAccount(host.id)
        cookies.delete(LOGIN_COOKIE, { path: '/' })
        redirect(303, '/')
    },
    /** Creates the host's lasting inbox once their account allows it (else `/auth/allow-inbox`). */
    createInbox: async ({ locals }) => {
        const host = requireHost(locals)
        if (!host.allowsInbox) return fail(409, { error: m.error_request() })
        await createInbox(host.id, null)
    },
    inboxInvite: async ({ request, locals }) => {
        const host = requireHost(locals)
        const form = await request.formData()
        const inbox = await inboxes.lasting(host.id)
        if (!inbox || form.get('inbox') !== inbox.id) return fail(409, { error: m.error_request() })
        if (!(await inboxes.setInvite(host.id, inbox.id, form.get('invite'))))
            return fail(400, { inviteInvalid: true })
    },
    inboxForget: async ({ request, locals }) => {
        const host = requireHost(locals)
        const inbox = (await request.formData()).get('inbox')
        if (typeof inbox !== 'string') return fail(400, { error: m.error_request() })
        await inboxes.forget(host.id, inbox)
    }
}
