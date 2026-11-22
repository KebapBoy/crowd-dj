import pkg from '../../../package.json' with { type: 'json' }
import type { RequestHandler } from './$types'

/** Liveness check for the health check, the reverse proxy and deploys; reports the version. */
export const GET: RequestHandler = () => Response.json({ status: 'ok', version: pkg.version })
