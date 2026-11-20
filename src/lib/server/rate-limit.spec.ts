import { expect, it } from 'vitest'
import { addressKey, createRateLimit } from './rate-limit'

it('takes units from every key or from none', () => {
    let now = 0
    const take = createRateLimit({ limits: { profile: 3, all: 5 }, windowMs: 1000, now: () => now })
    expect(take(['profile:a', 'all'], 2)).toBe(true)
    expect(take(['profile:a', 'all'], 2)).toBe(false)
    expect(take(['profile:a', 'all'])).toBe(true)
    expect(take(['profile:b', 'all'], 3)).toBe(false)
    expect(take(['profile:b', 'all'], 2)).toBe(true)
    expect(take(['profile:c', 'all'])).toBe(false)
    now = 1000
    expect(take(['profile:a', 'all'], 3)).toBe(true)
})

it('keeps nothing for refused calls and at most maxKeys keys', () => {
    let now = 0
    const take = createRateLimit({
        limits: { address: 1, all: 2 },
        windowMs: 1000,
        maxKeys: 3,
        now: () => now
    })
    expect(take(['address:a', 'all'])).toBe(true)
    expect(take(['address:b', 'all'])).toBe(true)
    // Refused by "all": "c" gets no window, so it has its unit once "all" has room again
    expect(take(['address:c', 'all'])).toBe(false)
    now = 1000
    expect(take(['address:c', 'all'])).toBe(true)
    // "a" started first and is forgotten when a fourth key comes in
    expect(take(['address:d'])).toBe(true)
    expect(take(['address:a'])).toBe(true)
})

it('counts an IPv6 address by its /64', () => {
    expect(addressKey('192.0.2.7')).toBe('192.0.2.7')
    expect(addressKey('::ffff:192.0.2.7')).toBe('192.0.2.7')
    expect(addressKey('2001:db8:0:1::5')).toBe('2001:db8:0:1::/64')
    expect(addressKey('2001:0db8:0000:0001:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:0:1::/64')
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(addressKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
    expect(addressKey('::1')).toBe('0:0:0:0::/64')
})
