/** Open pages of one session at most, so a flood of connections cannot exhaust the server. */
const SESSION_LISTENERS_MAX = 300
/** Open pages per profile (or host) in a session: a phone, a laptop and a few tabs. */
const KEY_LISTENERS_MAX = 5

type Listener = () => void

/**
 * Tells the open pages of a session that something changed (a track started, someone wished,
 * joined or left), so they reload their data. Changes close together are told once, after
 * `delayMs`, so a burst of actions does not make every page reload again and again. In memory: one
 * server process serves all sessions.
 */
export function createEvents({ delayMs = 500 }: { delayMs?: number } = {}) {
    const sessions = new Map<string, Map<Listener, string>>()
    const pending = new Map<string, ReturnType<typeof setTimeout>>()

    function flush(sessionId: string) {
        pending.delete(sessionId)
        for (const listener of sessions.get(sessionId)?.keys() ?? []) listener()
    }

    return {
        /**
         * Calls the listener on changes of the session until the returned function is called. Null
         * when the session or the key (a profile, or the host) has too many open pages already; a
         * reserved key (the host) only counts against its own limit, so others cannot lock it out.
         */
        subscribe(
            sessionId: string,
            key: string,
            listener: Listener,
            { reserved = false }: { reserved?: boolean } = {}
        ): (() => void) | null {
            const listeners = sessions.get(sessionId) ?? new Map<Listener, string>()
            const ofKey = [...listeners.values()].filter((other) => other === key).length
            if (ofKey >= KEY_LISTENERS_MAX) return null
            if (!reserved && listeners.size >= SESSION_LISTENERS_MAX) return null
            listeners.set(listener, key)
            sessions.set(sessionId, listeners)
            return () => {
                listeners.delete(listener)
                if (listeners.size === 0 && sessions.get(sessionId) === listeners)
                    sessions.delete(sessionId)
            }
        },

        /** The keys (profiles, the host) with a page of the session open. */
        present(sessionId: string): Set<string> {
            return new Set(sessions.get(sessionId)?.values())
        },

        publish(sessionId: string) {
            if (delayMs === 0) return flush(sessionId)
            if (pending.has(sessionId) || !sessions.has(sessionId)) return
            const timer = setTimeout(() => flush(sessionId), delayMs)
            timer.unref?.()
            pending.set(sessionId, timer)
        }
    }
}

export type Events = ReturnType<typeof createEvents>
