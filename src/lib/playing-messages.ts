import type { AccountView } from '#lib/server/accounts.ts'
import type { PlayerProblem } from '#lib/server/engine.ts'
import { m } from '#lib/paraglide/messages.js'

/** The name pages use for a Spotify account. */
export const accountName = (account: Pick<AccountView, 'displayName' | 'id'> | null) =>
    account?.displayName ?? account?.id ?? ''

/** What to tell about a problem with the player of the playing account (named `account`). */
export function problemMessage(problem: PlayerProblem, account: string): string {
    switch (problem) {
        case 'no_device':
            return m.playing_problem_no_device({ account })
        case 'refused':
            return m.playing_problem_refused({ account })
        case 'signin':
            return m.playing_problem_signin({ account })
        case 'busy':
            return m.playing_problem_busy()
        case 'failed':
            return m.playing_problem_failed()
    }
}
