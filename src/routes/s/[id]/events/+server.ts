import { error } from '@sveltejs/kit'
import { events, sessions } from '#lib/server/app.ts'
import { openSession } from '#lib/server/guards.ts'
import { m } from '#lib/paraglide/messages.js'
import type { RequestHandler } from './$types'

/** Keeps proxies from closing a quiet connection. */
const PING_MS = 25 * 1000
/** How often an open page counts as a sign of life and the session is checked for its end. */
const CHECK_MS = 60 * 1000

/**
 * Server-sent events of a session: `change` whenever something the page shows changed, so it
 * reloads its data. An open page is a sign of life, so the session does not end as idle; when it
 * ends (or the participant left it), the page gets a last `change` and the stream closes. Only
 * for the host and participants who are in the session.
 */
export const GET: RequestHandler = async ({ params, locals, request }) => {
    const session = await openSession(params.id)
    const isHost = locals.account?.id === session.hostId
    const isMember =
        locals.profile !== null &&
        (await sessions.membership(session.id, locals.profile.id)) === 'member'
    if (!isMember && !isHost) error(403, m.error_request())
    // The host's pages have their own places, so participants cannot lock them out
    const key = isHost ? `host:${session.hostId}` : `profile:${locals.profile!.id}`

    const encoder = new TextEncoder()
    let send = (text: string) => void text
    const unsubscribe = events.subscribe(session.id, key, () => send('event: change\ndata: \n\n'), {
        reserved: isHost
    })
    // Too many open pages: this one gets no live updates but keeps working (429 stops the
    // browser from trying again)
    if (!unsubscribe) error(429, m.session_too_many())
    await sessions.touch(session.id)

    let close = () => {}
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false
            send = (text: string) => {
                if (!closed) controller.enqueue(encoder.encode(text))
            }
            const ping = setInterval(() => send(': ping\n\n'), PING_MS)
            const check = setInterval(async () => {
                const current = await sessions.get(session.id).catch(() => null)
                // A participant who left (on another device) gets no more updates
                const still =
                    isHost ||
                    (await sessions
                        .membership(session.id, locals.profile!.id)
                        .catch(() => null)) === 'member'
                if (current && !current.endedAt && still)
                    await sessions.touch(session.id).catch(() => {})
                else {
                    send('event: change\ndata: \n\n')
                    close()
                }
            }, CHECK_MS)
            close = () => {
                if (closed) return
                closed = true
                clearInterval(ping)
                clearInterval(check)
                unsubscribe()
                try {
                    controller.close()
                } catch {
                    // Already closed by the client
                }
            }
            request.signal.addEventListener('abort', close)
            // Tells the browser how long to wait before it reconnects
            send('retry: 5000\n\n')
        },
        cancel() {
            close()
        }
    })
    return new Response(stream, {
        headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache, no-transform',
            // nginx (and SWAG) would otherwise buffer the stream
            'x-accel-buffering': 'no'
        }
    })
}
