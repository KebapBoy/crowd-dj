/**
 * Allows each key at most `limit` units per window (a fixed window per key); a call costs one unit
 * or more and counts against several keys at once (a participant, their session, everyone). In
 * memory: enough for one container, and forgetting it on a restart does no harm.
 */
export function createRateLimit({
    limits,
    windowMs,
    now = () => Date.now()
}: {
    /** Units per window for keys that start with each prefix, e.g. `{ profile: 100, all: 300 }`. */
    limits: Record<string, number>
    windowMs: number
    now?: () => number
}) {
    const windows = new Map<string, { start: number; used: number }>()

    function window(key: string, at: number) {
        let current = windows.get(key)
        if (!current || at - current.start >= windowMs) {
            current = { start: at, used: 0 }
            windows.set(key, current)
        }
        return current
    }

    /** Takes `cost` units from every key, or none when one of them has not enough left. */
    return (keys: string[], cost = 1): boolean => {
        const at = now()
        if (windows.size > 10_000)
            for (const [stale, entry] of windows)
                if (at - entry.start >= windowMs) windows.delete(stale)
        const entries = keys.map((key) => ({
            entry: window(key, at),
            limit: limits[key.split(':')[0]] ?? 0
        }))
        if (entries.some(({ entry, limit }) => entry.used + cost > limit)) return false
        for (const { entry } of entries) entry.used += cost
        return true
    }
}
