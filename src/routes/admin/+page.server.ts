import { error, fail } from '@sveltejs/kit'
import { accounts } from '#lib/server/app.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad, RequestEvent } from './$types'

function requireAdmin(locals: App.Locals) {
    if (!locals.account) error(401, m.admin_sign_in_required())
    if (!locals.account.isAdmin) error(403, m.admin_only())
}

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.account) return { signedIn: false as const }
    requireAdmin(locals)
    const all = await accounts.list()
    return {
        signedIn: true as const,
        room: all.find((account) => account.isRoom) ?? null,
        // The room account plays for everyone; it is not a personal host
        hosts: all.filter((account) => !account.isRoom)
    }
}

/** Runs an admin action on the account named in the form. */
function accountAction(run: (accountId: string) => Promise<unknown>) {
    return async ({ locals, request }: RequestEvent) => {
        requireAdmin(locals)
        const accountId = (await request.formData()).get('account')
        if (typeof accountId !== 'string' || !(await accounts.get(accountId)))
            return fail(400, { message: m.admin_unknown_account() })
        await run(accountId)
    }
}

export const actions: Actions = {
    approve: accountAction((id) => accounts.setApproved(id, true)),
    unapprove: accountAction((id) => accounts.setApproved(id, false)),
    remove: accountAction(async (id) => {
        if ((await accounts.get(id))?.isAdmin) return
        await accounts.remove(id)
    }),
    disconnectRoom: async ({ locals }) => {
        requireAdmin(locals)
        await accounts.replaceRoomAccount(null)
    }
}
