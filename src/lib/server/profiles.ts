import { and, eq, isNotNull, isNull, lte, ne, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { hashToken, randomId, randomToken } from './crypto'
import type { Database } from './db/open'
import { profile } from './db/schema'
import { NAME_MAX_LENGTH } from '../limits'

/** What pages may see of a profile: never the token. */
export interface ProfileView {
    id: string
    name: string
    /** The Spotify user the profile is linked to, for inbox playlists. */
    spotifyUserId: string | null
    /** Until when a sign-in vouches for that link; null for a pasted link. */
    spotifyVerifiedUntil: Date | null
}

/**
 * Spotify user IDs: old ones are usernames (letters, digits, dots, underscores, hyphens), newer ones
 * random letters and digits.
 */
const SPOTIFY_USER_ID = /^[0-9A-Za-z._-]{1,64}$/

/**
 * The Spotify user ID in a profile link as the Spotify app shares it
 * (`https://open.spotify.com/user/<id>?si=…`, also with a language like `/intl-de/`), or in a
 * Spotify URI (`spotify:user:<id>`); null for anything else.
 */
export function parseSpotifyUser(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const text = value.trim()
    let id: string | undefined
    const uri = /^spotify:user:([^:\s]+)$/.exec(text)
    if (uri) id = uri[1]
    else {
        let url: URL
        try {
            url = new URL(text)
        } catch {
            return null
        }
        if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return null
        id = /^\/(?:intl-[a-z]{2}(?:-[A-Za-z]{2})?\/)?user\/([^/]+)\/?$/.exec(url.pathname)?.[1]
    }
    if (!id) return null
    try {
        id = decodeURIComponent(id)
    } catch {
        return null
    }
    return SPOTIFY_USER_ID.test(id) ? id : null
}

/**
 * A name without control and format characters (e.g. ones that reverse the text after them) and
 * without surrounding or repeated whitespace, or null when it is empty or too long.
 */
export function normalizeName(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const name = cleanName(value)
    return name && name.length <= NAME_MAX_LENGTH ? name : null
}

function cleanName(value: string): string {
    return value
        .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * The profile name of someone signed in with Spotify: the first name from their display name, or
 * their username (the Spotify user ID) when there is no display name; cut to the longest name.
 */
export function spotifyProfileName(account: { id: string; displayName: string | null }): string {
    const firstName = cleanName(account.displayName ?? '').split(' ')[0]
    return (firstName || cleanName(account.id)).slice(0, NAME_MAX_LENGTH)
}

const view = (row: typeof profile.$inferSelect): ProfileView => ({
    id: row.id,
    name: row.name,
    spotifyUserId: row.spotifyUserId,
    spotifyVerifiedUntil: row.spotifyVerifiedUntil
})

export function createProfiles({ db, now = () => new Date() }: { db: Database; now?: () => Date }) {
    const other = alias(profile, 'other')
    /** Another profile that is linked to the Spotify user. */
    const heldByOther = (profileId: string, spotifyUserId: string) =>
        db
            .select({ id: other.id })
            .from(other)
            .where(and(eq(other.spotifyUserId, spotifyUserId), ne(other.id, profileId)))

    return {
        /** Creates a profile; returns it with the token for its cookie and personal link. */
        async create(name: string): Promise<{ profile: ProfileView; token: string }> {
            const token = randomToken()
            const row = { id: randomId(), tokenHash: hashToken(token), name, createdAt: now() }
            await db.insert(profile).values(row)
            return {
                profile: { id: row.id, name, spotifyUserId: null, spotifyVerifiedUntil: null },
                token
            }
        },

        /** The profile a cookie or personal link belongs to. */
        async forToken(token: string): Promise<ProfileView | null> {
            const row = await db.query.profile.findFirst({
                where: eq(profile.tokenHash, hashToken(token))
            })
            return row ? view(row) : null
        },

        async rename(profileId: string, name: string) {
            await db.update(profile).set({ name }).where(eq(profile.id, profileId))
        },

        /**
         * Links the profile to the Spotify user a person says they are. Nobody can prove that without
         * signing in with Spotify, so the first profile to claim a user keeps it: false when another
         * profile is linked to it. A pasted link is never vouched for by a sign-in.
         */
        async linkSpotify(profileId: string, spotifyUserId: string): Promise<boolean> {
            const result = await db
                .update(profile)
                .set({ spotifyUserId, spotifyVerifiedUntil: null })
                .where(
                    and(eq(profile.id, profileId), notExists(heldByOther(profileId, spotifyUserId)))
                )
            return result.rowsAffected > 0
        },

        async unlinkSpotify(profileId: string) {
            await db
                .update(profile)
                .set({ spotifyUserId: null, spotifyVerifiedUntil: null })
                .where(eq(profile.id, profileId))
        },

        /**
         * Links the profile of a browser signed in with Spotify to that account, vouched for until
         * its sign-in expires (`until`): the sign-in proves it, so it takes the user from a profile
         * that only claimed it by a link, or whose sign-ins have expired. A profile another live
         * sign-in vouches for keeps it (the host's other device), so the link does not move back
         * and forth. Also extends the profile's own claim to a later sign-in. Returns whether this
         * profile has it now.
         */
        async claimSpotify(
            profileId: string,
            spotifyUserId: string,
            until: Date
        ): Promise<boolean> {
            const [, claimed] = await db.batch([
                db
                    .update(profile)
                    .set({ spotifyUserId: null, spotifyVerifiedUntil: null })
                    .where(
                        and(
                            eq(profile.spotifyUserId, spotifyUserId),
                            ne(profile.id, profileId),
                            or(
                                isNull(profile.spotifyVerifiedUntil),
                                lte(profile.spotifyVerifiedUntil, now())
                            )
                        )
                    ),
                db
                    .update(profile)
                    .set({
                        spotifyUserId,
                        spotifyVerifiedUntil: sql`max(coalesce(case when ${profile.spotifyUserId} = ${spotifyUserId}
                            then ${profile.spotifyVerifiedUntil} end, 0), ${until.getTime()})`
                    })
                    .where(
                        and(
                            eq(profile.id, profileId),
                            notExists(heldByOther(profileId, spotifyUserId))
                        )
                    )
            ])
            return claimed.rowsAffected > 0
        },

        /**
         * Lets go of the account's link when its browser signs out, so the profile of a device that
         * is not the host's (a friend's) does not keep getting their inbox tracks.
         */
        async releaseSpotify(profileId: string, spotifyUserId: string) {
            await db
                .update(profile)
                .set({ spotifyUserId: null, spotifyVerifiedUntil: null })
                .where(
                    and(
                        eq(profile.id, profileId),
                        eq(profile.spotifyUserId, spotifyUserId),
                        isNotNull(profile.spotifyVerifiedUntil)
                    )
                )
        },

        /** Lets go of every link sign-ins vouched for, when the account is deleted. */
        async releaseAccount(spotifyUserId: string) {
            await db
                .update(profile)
                .set({ spotifyUserId: null, spotifyVerifiedUntil: null })
                .where(
                    and(
                        eq(profile.spotifyUserId, spotifyUserId),
                        isNotNull(profile.spotifyVerifiedUntil)
                    )
                )
        }
    }
}

export type Profiles = ReturnType<typeof createProfiles>
