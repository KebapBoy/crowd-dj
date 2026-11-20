import { accounts } from '#lib/server/app.ts'
import type { LayoutServerLoad } from './$types'

/**
 * The participant profile for the header, and the sign-ins of the host and their player that need
 * renewing, for the banner on every page.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
    const host = locals.account
    const profile = locals.profile
    if (!host) return { profile, renewals: [] }
    const player = await accounts.player(host.id)
    const renewals = [
        { kind: 'host' as const, account: host },
        ...(player ? [{ kind: 'player' as const, account: player }] : [])
    ]
        .filter(({ account }) => account.tokenStatus !== 'ok')
        .map(({ kind, account }) => ({
            kind,
            name: account.displayName ?? account.id,
            status: account.tokenStatus,
            expiresAt: account.tokenExpiresAt
        }))
    return { profile, renewals }
}
