/** Keys kept at most; beyond that the oldest are forgotten (they may start a fresh window). */
const MAX_KEYS = 100_000
/** How often expired windows are swept out. */
const SWEEP_INTERVAL_MS = 60 * 1000

/**
 * Allows each key at most `limit` units per window (a fixed window per key); a call costs one unit
 * or more and counts against several keys at once (a participant, their session, everyone). In
 * memory: enough for one container, and forgetting it on a restart does no harm. Refused calls
 * leave nothing behind, so a flood of new keys only grows the map as far as calls are accepted.
 */
export function createRateLimit({
    limits,
    windowMs,
    maxKeys = MAX_KEYS,
    now = () => Date.now()
}: {
    /** Units per window for keys that start with each prefix, e.g. `{ profile: 100, all: 300 }`. */
    limits: Record<string, number>
    windowMs: number
    maxKeys?: number
    now?: () => number
}) {
    /** Map order is insertion order: a key moves to the end when its window starts. */
    const windows = new Map<string, { start: number; used: number }>()
    let sweptAt = 0

    function sweep(at: number) {
        if (at - sweptAt < SWEEP_INTERVAL_MS) return
        sweptAt = at
        for (const [key, entry] of windows) if (at - entry.start >= windowMs) windows.delete(key)
    }

    /** Units used in the key's current window. */
    function used(key: string, at: number) {
        const entry = windows.get(key)
        return entry && at - entry.start < windowMs ? entry.used : 0
    }

    function take(key: string, at: number, cost: number) {
        const entry = windows.get(key)
        if (entry && at - entry.start < windowMs) {
            entry.used += cost
            return
        }
        windows.delete(key)
        windows.set(key, { start: at, used: cost })
        if (windows.size > maxKeys) windows.delete(windows.keys().next().value!)
    }

    /** Takes `cost` units from every key, or none when one of them has not enough left. */
    return (keys: string[], cost = 1): boolean => {
        const at = now()
        sweep(at)
        const refused = keys.some((key) => used(key, at) + cost > (limits[key.split(':')[0]] ?? 0))
        if (refused) return false
        for (const key of keys) take(key, at, cost)
        return true
    }
}

/**
 * The part of a client address that limits count against. An IPv6 connection usually has a whole
 * /64 to pick addresses from, so its first four groups count; IPv4 (also IPv4-mapped IPv6) as is.
 */
export function addressKey(address: string): string {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
    if (mapped) return mapped[1]
    if (!address.includes(':')) return address
    const [head, tail] = address.toLowerCase().split('%')[0].split('::')
    const left = head ? head.split(':') : []
    const right = tail ? tail.split(':') : []
    const groups =
        tail === undefined
            ? left
            : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    return `${groups
        .slice(0, 4)
        .map((group) => group.replace(/^0+(?=.)/, ''))
        .join(':')}::/64`
}
