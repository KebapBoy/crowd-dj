import { eq } from 'drizzle-orm'
import { hashToken, randomId, randomToken } from './crypto'
import type { Database } from './db/open'
import { profile } from './db/schema'
import { NAME_MAX_LENGTH } from '../limits'

/** What pages may see of a profile: never the token. */
export interface ProfileView {
    id: string
    name: string
}

/**
 * A name without control and format characters (e.g. ones that reverse the text after them) and
 * without surrounding or repeated whitespace, or null when it is empty or too long.
 */
export function normalizeName(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const name = value
        .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return name && name.length <= NAME_MAX_LENGTH ? name : null
}

export function createProfiles({ db, now = () => new Date() }: { db: Database; now?: () => Date }) {
    return {
        /** Creates a profile; returns it with the token for its cookie and personal link. */
        async create(name: string): Promise<{ profile: ProfileView; token: string }> {
            const token = randomToken()
            const row = { id: randomId(), tokenHash: hashToken(token), name, createdAt: now() }
            await db.insert(profile).values(row)
            return { profile: { id: row.id, name }, token }
        },

        /** The profile a cookie or personal link belongs to. */
        async forToken(token: string): Promise<ProfileView | null> {
            const row = await db.query.profile.findFirst({
                where: eq(profile.tokenHash, hashToken(token))
            })
            return row ? { id: row.id, name: row.name } : null
        },

        async rename(profileId: string, name: string) {
            await db.update(profile).set({ name }).where(eq(profile.id, profileId))
        }
    }
}

export type Profiles = ReturnType<typeof createProfiles>
