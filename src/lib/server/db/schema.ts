import { sql } from 'drizzle-orm'
import {
    index,
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
    /**
     * The Spotify user the person said they are (their profile link), so tracks they add to an
     * inbox playlist land in their pool. Set from the account for a browser signed in with Spotify.
     */
    spotifyUserId: text('spotify_user_id').unique(),
    /**
     * Set while a sign-in with that Spotify account vouches for `spotify_user_id` (rather than a
     * pasted link): until the latest such sign-in of this profile's browser expires. Until then no
     * other signed-in browser takes the user away.
     */
    spotifyVerifiedUntil: integer('spotify_verified_until', { mode: 'timestamp_ms' }),
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
        /** ... and at least this share of the participants (joined, not left), in percent. */
        skipPercent: integer('skip_percent').notNull().default(50),
        /**
         * What the engine does: `stopped` until the host presses play, `playing` while it hands
         * Spotify the next track, `paused` after something else was played on the account.
         */
        playback: text('playback', { enum: ['stopped', 'playing', 'paused'] })
            .notNull()
            .default('stopped'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        /**
         * Last sign of life (a visit, an open session page, a track of the session playing); the
         * session ends after a while without.
         */
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

/** A profile that joined a session (and maybe left it). */
export const sessionMember = sqliteTable(
    'session_member',
    {
        sessionId: text('session_id')
            .notNull()
            .references(() => session.id, { onDelete: 'cascade' }),
        profileId: text('profile_id')
            .notNull()
            .references(() => profile.id, { onDelete: 'cascade' }),
        joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
        /**
         * Set when the profile left: no more turns, and a visit does not join it again; only joining
         * on purpose does.
         */
        leftAt: integer('left_at', { mode: 'timestamp_ms' })
    },
    (table) => [primaryKey({ columns: [table.sessionId, table.profileId] })]
)

/**
 * Spotify tracks crowd-dj has seen in search results, albums or pasted links. There is no batch
 * lookup any more, so each track is looked up once and kept.
 */
export const track = sqliteTable('track', {
    /** Spotify track ID */
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    artists: text('artists', { mode: 'json' }).$type<string[]>().notNull(),
    album: text('album').notNull(),
    coverUrl: text('cover_url'),
    durationMs: integer('duration_ms').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull()
})

/**
 * A track in a participant's pool, kept across sessions. A session's pool limit counts the most
 * recently added tracks.
 */
export const poolItem = sqliteTable(
    'pool_item',
    {
        profileId: text('profile_id')
            .notNull()
            .references(() => profile.id, { onDelete: 'cascade' }),
        trackId: text('track_id')
            .notNull()
            .references(() => track.id),
        addedAt: integer('added_at', { mode: 'timestamp_ms' }).notNull()
    },
    (table) => [
        primaryKey({ columns: [table.profileId, table.trackId] }),
        index('pool_item_newest').on(table.profileId, table.addedAt)
    ]
)

/** A track someone wants to hear soon in a session. Each track can be wished once per session. */
export const wish = sqliteTable(
    'wish',
    {
        id: text('id').primaryKey(),
        sessionId: text('session_id')
            .notNull()
            .references(() => session.id, { onDelete: 'cascade' }),
        profileId: text('profile_id')
            .notNull()
            .references(() => profile.id, { onDelete: 'cascade' }),
        trackId: text('track_id')
            .notNull()
            .references(() => track.id),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        /** Set when the track was played; until then the wish is open. */
        playedAt: integer('played_at', { mode: 'timestamp_ms' })
    },
    (table) => [
        uniqueIndex('wish_once_per_session').on(table.sessionId, table.trackId),
        index('wish_of_profile').on(table.sessionId, table.profileId, table.createdAt)
    ]
)

/**
 * A track the engine handed to Spotify in a session: queued shortly before the current one ends
 * (or played right away), started when Spotify plays it, ended when something else plays. No track
 * plays twice in a session.
 */
export const play = sqliteTable(
    'play',
    {
        id: text('id').primaryKey(),
        sessionId: text('session_id')
            .notNull()
            .references(() => session.id, { onDelete: 'cascade' }),
        trackId: text('track_id')
            .notNull()
            .references(() => track.id),
        /** Whose turn it was; null when the profile has been deleted since. */
        profileId: text('profile_id').references(() => profile.id, { onDelete: 'set null' }),
        /** The wish it fulfils; null for a track from a pool. */
        wishId: text('wish_id').references(() => wish.id, { onDelete: 'set null' }),
        queuedAt: integer('queued_at', { mode: 'timestamp_ms' }).notNull(),
        startedAt: integer('started_at', { mode: 'timestamp_ms' }),
        endedAt: integer('ended_at', { mode: 'timestamp_ms' })
    },
    (table) => [
        uniqueIndex('play_once_per_session').on(table.sessionId, table.trackId),
        index('play_of_session').on(table.sessionId, table.queuedAt)
    ]
)

/**
 * A participant's vote to skip a track while it plays. Votes belong to the play, so they count
 * only for that track.
 */
export const skipVote = sqliteTable(
    'skip_vote',
    {
        playId: text('play_id')
            .notNull()
            .references(() => play.id, { onDelete: 'cascade' }),
        profileId: text('profile_id')
            .notNull()
            .references(() => profile.id, { onDelete: 'cascade' }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    },
    (table) => [primaryKey({ columns: [table.playId, table.profileId] })]
)

/**
 * A collaborative playlist of a host that crowd-dj created as an inbox: tracks people add to it in
 * the Spotify app land in their pools (`inbox_item.added_by` matched with
 * `profile.spotify_user_id`). A host has one that lasts, and each session may have its own.
 */
export const inbox = sqliteTable(
    'inbox',
    {
        /** Spotify playlist ID */
        id: text('id').primaryKey(),
        hostId: text('host_id')
            .notNull()
            .references(() => spotifyAccount.id, { onDelete: 'cascade' }),
        /** Set for the inbox of one session; null for the host's lasting one. */
        sessionId: text('session_id')
            .unique()
            .references(() => session.id, { onDelete: 'cascade' }),
        /** The invitation to collaborate that the host made in the Spotify app; shown in sessions. */
        inviteUrl: text('invite_url'),
        /** The playlist's version when it was last read, so an unchanged one is not read again. */
        snapshotId: text('snapshot_id'),
        /**
         * Whether the last read got every item: one that was cut off at `INBOX_ITEMS_MAX` is not
         * tidied up, since removing a track removes the copies that were not read too.
         */
        complete: integer('complete', { mode: 'boolean' }).notNull().default(true),
        syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    },
    (table) => [
        uniqueIndex('inbox_lasting_per_host')
            .on(table.hostId)
            .where(sql`session_id is null`)
    ]
)

/** What an inbox playlist held when it was last read: who added which track, and when. */
export const inboxItem = sqliteTable(
    'inbox_item',
    {
        inboxId: text('inbox_id')
            .notNull()
            .references(() => inbox.id, { onDelete: 'cascade' }),
        trackId: text('track_id')
            .notNull()
            .references(() => track.id),
        /** The Spotify user who added it; empty when Spotify did not say (it is never imported). */
        addedBy: text('added_by').notNull(),
        addedAt: integer('added_at', { mode: 'timestamp_ms' }).notNull(),
        /**
         * When it went into the pool of the profile linked to `added_by`; null while no profile is.
         * It goes in once: taking it out of the pool later does not bring it back.
         */
        importedAt: integer('imported_at', { mode: 'timestamp_ms' }),
        /**
         * The profile it went into. Only while that profile is still linked to `added_by` may
         * tidying up remove the track from the playlist.
         */
        importedTo: text('imported_to').references(() => profile.id, { onDelete: 'set null' })
    },
    (table) => [
        primaryKey({ columns: [table.inboxId, table.trackId, table.addedBy] }),
        index('inbox_item_added_by').on(table.addedBy)
    ]
)

export type Profile = typeof profile.$inferSelect
export type Inbox = typeof inbox.$inferSelect
export type Session = typeof session.$inferSelect
export type SessionMode = Session['mode']
export type Track = typeof track.$inferSelect
export type Play = typeof play.$inferSelect
export type Playback = Session['playback']
