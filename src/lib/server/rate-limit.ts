/** Keys kept at most; beyond that the oldest are forgotten (they may start a fresh window). */
const MAX_KEYS = 100_000
/** How often expired windows are swept out. */
const SWEEP_INTERVAL_MS = 60 * 1000

/**
 * Allows each key at most `limit` units per window (a fixed window per key); a call costs one unit
 * or more and counts against several keys at once (a participant, their session, everyone). In
 * memory: enough for one container, and forgetting it on a restart does no harm. Refused calls
 * leave nothing behind, so a flood of new keys only grows the map as far as calls are accepted.
 *
 * A shared limit (`shares`) is split fairly once it runs out: a call it would refuse still passes
 * while the caller's own key of the group it is shared among (e.g. its host) has used less than an
 * equal share of it in its window, the share taken among the keys of that group that have a window
 * running. So nobody can use it up for everyone else, while the ones who took more than their share
 * wait. The group's keys must be ones callers cannot make up at will, or making new ones shrinks
 * everyone's share. The shared key never goes over twice its limit.
 */
export function createRateLimit({
    limits,
    windowMs,
    shares = {},
    maxKeys = MAX_KEYS,
    now = () => Date.now()
}: {
    /** Units per window for keys that start with each prefix, e.g. `{ profile: 100, all: 300 }`. */
    limits: Record<string, number>
    /** Prefixes of shared limits and the prefix of the keys they are split among, e.g. `{ all: 'session' }`. */
    shares?: Record<string, string>
    windowMs: number
    maxKeys?: number
    now?: () => number
}) {
    /** Map order is insertion order: a key moves to the end when its window starts. */
    const windows = new Map<string, { start: number; used: number }>()
    /** The keys of each group a limit is shared among, so counting them does not scan the map. */
    const groups = new Map(Object.values(shares).map((group) => [group, new Set<string>()]))
    let sweptAt = 0

    const prefix = (key: string) => key.split(':')[0]

    function forget(key: string) {
        windows.delete(key)
        groups.get(prefix(key))?.delete(key)
    }

    function sweep(at: number) {
        if (at - sweptAt < SWEEP_INTERVAL_MS) return
        sweptAt = at
        for (const [key, entry] of windows) if (at - entry.start >= windowMs) forget(key)
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
        groups.get(prefix(key))?.add(key)
        if (windows.size > maxKeys) forget(windows.keys().next().value!)
    }

    /** Whether the caller's own key may still take `cost` from the shared limit that ran out. */
    function withinShare(shared: string, keys: string[], at: number, cost: number) {
        const group = shares[prefix(shared)]
        const own = group && keys.find((key) => prefix(key) === group)
        const limit = limits[prefix(shared)]
        if (!own || used(shared, at) + cost > 2 * limit) return false
        let sharing = used(own, at) > 0 ? 0 : 1
        for (const key of groups.get(group)!) if (used(key, at) > 0) sharing++
        return used(own, at) + cost <= limit / sharing
    }

    /** Takes `cost` units from every key, or none when one of them has not enough left. */
    return (keys: string[], cost = 1): boolean => {
        const at = now()
        sweep(at)
        const refused = keys.some(
            (key) =>
                used(key, at) + cost > (limits[prefix(key)] ?? 0) &&
                !withinShare(key, keys, at, cost)
        )
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
