import { error, redirect } from '@sveltejs/kit'
import { accounts, LOGIN_COOKIE } from '#lib/server/app.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad } from './$types'

function requireHost(locals: App.Locals) {
    if (!locals.account) error(401, m.sign_in_required())
    return locals.account
}

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.account) return { host: null, player: null }
    return { host: locals.account, player: await accounts.player(locals.account.id) }
}

export const actions: Actions = {
    removePlayer: async ({ locals }) => {
        await accounts.removePlayer(requireHost(locals).id)
    },
    deleteAccount: async ({ locals, cookies }) => {
        await accounts.removeHost(requireHost(locals).id)
        cookies.delete(LOGIN_COOKIE, { path: '/' })
        redirect(303, '/')
    }
}
