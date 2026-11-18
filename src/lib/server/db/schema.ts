import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Instance-wide settings as key/value pairs, e.g. which connected account is the room account. */
export const setting = sqliteTable('setting', {
    key: text('key').primaryKey(),
    value: text('value').notNull()
})

/** Keys of the `setting` table. */
export const SETTING = {
    /** Spotify user ID of the room account (a row in `spotify_account`). */
    roomAccountId: 'room_account_id'
} as const

/**
 * A Spotify account that signed in (admin, personal host) or was connected as the room account.
 * Tokens are encrypted with APP_SECRET (see `crypto.ts`).
 */
export const spotifyAccount = sqliteTable('spotify_account', {
    /** Spotify user ID */
    id: text('id').primaryKey(),
    displayName: text('display_name'),
    imageUrl: text('image_url'),
    /** Approved by the admin to host sessions on their own device. */
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    refreshToken: text('refresh_token').notNull(),
    accessToken: text('access_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope').notNull(),
    /** Last sign-in through Spotify; the refresh token expires 6 months after it. */
    authorizedAt: integer('authorized_at', { mode: 'timestamp_ms' }).notNull(),
    /** Set when Spotify rejected the refresh token: the account has to sign in again. */
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

/** A browser signed in with a Spotify account. The cookie holds the token, the table its hash. */
export const login = sqliteTable('login', {
    tokenHash: text('token_hash').primaryKey(),
    accountId: text('account_id')
        .notNull()
        .references(() => spotifyAccount.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
})

export type SpotifyAccount = typeof spotifyAccount.$inferSelect
