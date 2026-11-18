import { describe, expect, it } from 'vitest'
import { decrypt, encrypt, hashToken, randomToken, tokenKey } from './crypto'

const key = tokenKey('a'.repeat(32))

describe('token encryption', () => {
    it('round-trips and never stores the plain text', () => {
        const encrypted = encrypt('refresh-token', key)
        expect(encrypted).not.toContain('refresh-token')
        expect(encrypted.startsWith('v1.')).toBe(true)
        expect(decrypt(encrypted, key)).toBe('refresh-token')
    })

    it('uses a fresh IV every time', () => {
        expect(encrypt('x', key)).not.toBe(encrypt('x', key))
    })

    it('rejects another key and changed values', () => {
        const encrypted = encrypt('refresh-token', key)
        expect(() => decrypt(encrypted, tokenKey('b'.repeat(32)))).toThrow()
        const parts = encrypted.split('.')
        parts[3] = Buffer.from('tampered').toString('base64url')
        expect(() => decrypt(parts.join('.'), key)).toThrow()
        expect(() => decrypt('plain', key)).toThrow()
    })
})

describe('tokens', () => {
    it('are random and hashed', () => {
        const token = randomToken()
        expect(token).not.toBe(randomToken())
        expect(hashToken(token)).toBe(hashToken(token))
        expect(hashToken(token)).not.toBe(token)
    })
})
