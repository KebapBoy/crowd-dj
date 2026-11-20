import { beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from './db/migrate'
import { openDatabase } from './db/open'
import { createProfiles, normalizeName } from './profiles'

let profiles: ReturnType<typeof createProfiles>

beforeEach(async () => {
    const db = openDatabase('file::memory:')
    await migrateDatabase(db)
    profiles = createProfiles({ db })
})

describe('profiles', () => {
    it('finds a profile by its token and only by it', async () => {
        const { profile, token } = await profiles.create('Alex')
        expect(await profiles.forToken(token)).toEqual(profile)
        expect(await profiles.forToken(`${token}x`)).toBeNull()
    })

    it('renames a profile', async () => {
        const { profile, token } = await profiles.create('Alex')
        await profiles.rename(profile.id, 'Sam')
        expect((await profiles.forToken(token))?.name).toBe('Sam')
    })
})

describe('normalizeName', () => {
    it('collapses whitespace and rejects empty or long names', () => {
        expect(normalizeName('  Alex   Example ')).toBe('Alex Example')
        expect(normalizeName('   ')).toBeNull()
        expect(normalizeName('x'.repeat(41))).toBeNull()
        expect(normalizeName(null)).toBeNull()
        expect(normalizeName('\u202Eevil\u200B name')).toBe('evil name')
    })
})
