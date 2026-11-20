import { beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from './db/migrate'
import { openDatabase } from './db/open'
import { createProfiles, normalizeName, spotifyProfileName } from './profiles'

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

describe('spotifyProfileName', () => {
    it('takes the first name from the display name', () => {
        expect(spotifyProfileName({ id: 'user1', displayName: '  Alex   Example ' })).toBe('Alex')
        expect(spotifyProfileName({ id: 'user1', displayName: 'Alex' })).toBe('Alex')
        expect(spotifyProfileName({ id: 'user1', displayName: `Alex ${'x'.repeat(50)}` })).toBe(
            'Alex'
        )
        expect(spotifyProfileName({ id: 'user1', displayName: 'x'.repeat(50) })).toBe(
            'x'.repeat(40)
        )
    })

    it('falls back to the username without a display name', () => {
        expect(spotifyProfileName({ id: 'user1', displayName: null })).toBe('user1')
        expect(spotifyProfileName({ id: 'user1', displayName: ' \u200B ' })).toBe('user1')
        expect(spotifyProfileName({ id: 'u'.repeat(50), displayName: null })).toBe('u'.repeat(40))
    })
})
