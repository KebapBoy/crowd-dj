import type { RequestHandler } from './$types'

/** Liveness check for the container healthcheck and the reverse proxy. */
export const GET: RequestHandler = () => new Response('ok')
