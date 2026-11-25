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

it('lets sessions under their share pass once a shared limit ran out', () => {
    let now = 0
    const take = createRateLimit({
        limits: { host: 150, all: 300 },
        shares: { all: 'host' },
        windowMs: 1000,
        now: () => now
    })
    // Two hosts use up the instance's limit
    expect(take(['host:a', 'all'], 150)).toBe(true)
    expect(take(['host:b', 'all'], 150)).toBe(true)
    expect(take(['host:b', 'all'])).toBe(false)
    // A third host still gets its share of 300 / 3
    expect(take(['host:c', 'all'], 100)).toBe(true)
    expect(take(['host:c', 'all'])).toBe(false)
    // A fourth gets 300 / 4, the ones above it nothing
    expect(take(['host:d', 'all'], 76)).toBe(false)
    expect(take(['host:d', 'all'], 75)).toBe(true)
    expect(take(['host:a', 'all'])).toBe(false)
    // A key outside any group does not share
    expect(take(['all'])).toBe(false)
    // Hosts whose window ended no longer take a share
    now = 1000
    expect(take(['host:a', 'all'], 150)).toBe(true)
    expect(take(['host:b', 'all'], 150)).toBe(true)
    expect(take(['host:c', 'all'], 101)).toBe(false)
    expect(take(['host:c', 'all'], 100)).toBe(true)
})

it('never lets a shared limit go over twice its limit', () => {
    const take = createRateLimit({
        limits: { host: 10, all: 10 },
        shares: { all: 'host' },
        windowMs: 1000,
        now: () => 0
    })
    for (const host of 'abcdefghij') take([`host:${host}`, 'all'], 10)
    let passed = 0
    for (let i = 0; i < 100; i++) if (take([`host:new${i}`, 'all'])) passed++
    expect(passed).toBeLessThanOrEqual(10)
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
