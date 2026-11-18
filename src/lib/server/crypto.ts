import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'

const VERSION = 'v1'

/** Derives the 256-bit key for stored tokens from APP_SECRET. */
export function tokenKey(secret: string): Buffer {
    return Buffer.from(hkdfSync('sha256', secret, 'crowd-dj', 'spotify-token-encryption', 32))
}

/** Encrypts with AES-256-GCM; the result is `v1.<iv>.<tag>.<ciphertext>` in base64url. */
export function encrypt(plaintext: string, key: Buffer): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return [VERSION, iv, cipher.getAuthTag(), ciphertext]
        .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
        .join('.')
}

/** Reverses `encrypt`; throws when the value was changed or encrypted with another key. */
export function decrypt(value: string, key: Buffer): string {
    const [version, iv, tag, ciphertext] = value.split('.')
    if (version !== VERSION || !iv || !tag || ciphertext === undefined)
        throw new Error('Unknown format of an encrypted value')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final()
    ]).toString('utf8')
}

/** A random token for cookies and OAuth state (256 bits, base64url). */
export function randomToken(): string {
    return randomBytes(32).toString('base64url')
}

/** Hash under which a cookie token is stored, so a leaked database does not leak sign-ins. */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('base64url')
}
