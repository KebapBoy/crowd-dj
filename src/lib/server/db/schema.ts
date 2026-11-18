import { integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

/** Instance-wide settings as key/value pairs. */
export const setting = sqliteTable('setting', {
    key: text('key').primaryKey(),
    value: text('value').notNull()
})

/**
 * A Spotify account: a host that signed in, or the player a host connected (`player_of`), which
 * plays the host's sessions instead of the host's own account. Tokens are encrypted with
 * APP_SECRET (see `crypto.ts`).
 */
export const spotifyAccount = sqliteTable('spotify_account', {
    /** Spotify user ID */
    id: text('id').primaryKey(),
    displayName: text('display_name'),
    imageUrl: text('image_url'),
    /** Set for a player: the host it belongs to. A host has at most one player. */
    playerOf: text('player_of')
        .unique()
        .references((): AnySQLiteColumn => spotifyAccount.id, { onDelete: 'cascade' }),
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
