// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AccountView } from '#lib/server/accounts.ts'
import type { ProfileView } from '#lib/server/profiles.ts'

declare global {
    /** Version from package.json, set by vite.config.ts. */
    const __APP_VERSION__: string

    namespace App {
        // interface Error {}
        interface Locals {
            /** Spotify account this browser is signed in with: a host. */
            account: AccountView | null
            /** When that sign-in expires. */
            loginExpiresAt: Date | null
            /** Participant profile of this browser. */
            profile: ProfileView | null
        }
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {}
