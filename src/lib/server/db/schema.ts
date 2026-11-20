import { sql } from 'drizzle-orm'
import {
    integer,
    primaryKey,
    sqliteTable,
    text,
    uniqueIndex,
    type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'

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

/**
 * A participant: one person, known by a cookie in each browser they use. The cookie holds a random
 * token, the table its hash; the personal link that moves the profile to another device carries
 * the same token.
 */
export const profile = sqliteTable('profile', {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

/**
 * A session of a host. It plays through the host's player, else the host's own account; since a
 * player belongs to exactly one host, one open session per host means one per playing account.
 * The id is random and is the join link; it stops working when the session ends.
 */
export const session = sqliteTable(
    'session',
    {
        id: text('id').primaryKey(),
        hostId: text('host_id')
            .notNull()
            .references(() => spotifyAccount.id, { onDelete: 'cascade' }),
        mode: text('mode', { enum: ['wishes_first', 'pool_only', 'wishes_only'] })
            .notNull()
            .default('wishes_first'),
        anonymous: integer('anonymous', { mode: 'boolean' }).notNull().default(false),
        /** Limits per person; null means no limit. */
        maxOpenWishes: integer('max_open_wishes'),
        maxSessionWishes: integer('max_session_wishes'),
        maxPoolSize: integer('max_pool_size'),
        /** Whether people may skip their own tracks without a vote. */
        skipOwn: integer('skip_own', { mode: 'boolean' }).notNull().default(true),
        skipVoting: integer('skip_voting', { mode: 'boolean' }).notNull().default(false),
        /** Skip voting: at least this many votes ... */
        skipVotes: integer('skip_votes').notNull().default(2),
        /** ... and at least this share of the active participants, in percent. */
        skipPercent: integer('skip_percent').notNull().default(50),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        /** Last sign of life (a visit; later also playback); the session ends after a while without. */
        activeAt: integer('active_at', { mode: 'timestamp_ms' }).notNull(),
        endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
        endReason: text('end_reason', { enum: ['host', 'idle'] })
    },
    (table) => [
        uniqueIndex('session_open_per_host')
            .on(table.hostId)
            .where(sql`ended_at is null`)
    ]
)

/** A profile that joined a session. */
export const sessionMember = sqliteTable(
    'session_member',
    {
        sessionId: text('session_id')
            .notNull()
            .references(() => session.id, { onDelete: 'cascade' }),
        profileId: text('profile_id')
            .notNull()
            .references(() => profile.id, { onDelete: 'cascade' }),
        joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull()
    },
    (table) => [primaryKey({ columns: [table.sessionId, table.profileId] })]
)

export type Profile = typeof profile.$inferSelect
export type Session = typeof session.$inferSelect
export type SessionMode = Session['mode']
