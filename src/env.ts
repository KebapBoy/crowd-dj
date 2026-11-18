import { defineEnvVars } from '@sveltejs/kit/env'

/** Optional for now: the Spotify sign-in that needs these is not built yet. */
const optional = (value: string | undefined) => value || undefined

export const variables = defineEnvVars({
    DATABASE_URL: {
        description:
            'SQLite database as a libsql URL. Defaults to file:local.db in the working tree.',
        schema: (value) => value || 'file:local.db'
    },
    SPOTIFY_CLIENT_ID: {
        description: 'Client ID of the Spotify app (developer dashboard).',
        schema: optional
    },
    SPOTIFY_CLIENT_SECRET: {
        description: 'Client secret of the Spotify app. Secret.',
        schema: optional
    },
    ADMIN_SPOTIFY_USER_ID: {
        description:
            'Spotify user ID of the admin, who connects the room account and approves hosts.',
        schema: optional
    },
    APP_SECRET: {
        description: 'Key for encrypting stored Spotify tokens and signing cookies. Secret.',
        schema: optional
    }
})
