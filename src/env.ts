import { building } from '$app/env'
import { defineEnvVars } from '@sveltejs/kit/env'

/**
 * Fails at start when the variable is missing. `vite build` analyses the server without the
 * settings of an installation (e.g. in the Dockerfile), so the check waits for the real start.
 */
const required =
    (name: string, check?: (value: string) => string | undefined) =>
    (value: string | undefined): string => {
        if (building) return value ?? ''
        if (!value) throw new Error(`${name} is not set (see .env.example)`)
        const problem = check?.(value)
        if (problem) throw new Error(problem)
        return value
    }

export const variables = defineEnvVars({
    DATABASE_URL: {
        description:
            'SQLite database as a libsql URL. Defaults to file:local.db in the working tree.',
        schema: (value) => value || 'file:local.db'
    },
    SPOTIFY_CLIENT_ID: {
        description: 'Client ID of the Spotify app (developer dashboard).',
        schema: required('SPOTIFY_CLIENT_ID')
    },
    SPOTIFY_CLIENT_SECRET: {
        description: 'Client secret of the Spotify app. Secret.',
        schema: required('SPOTIFY_CLIENT_SECRET')
    },
    APP_SECRET: {
        description: 'Key for encrypting stored Spotify tokens (at least 32 characters). Secret.',
        schema: required('APP_SECRET', (value) =>
            value.length < 32
                ? 'APP_SECRET must have at least 32 characters (openssl rand -base64 32)'
                : undefined
        )
    }
})
