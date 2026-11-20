import { expect, it } from 'vitest'
import { createRateLimit } from './rate-limit'

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
