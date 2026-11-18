import { startAuthorization } from '#lib/server/auth.ts'
import type { RequestHandler } from './$types'

/** Sign-in of a host or the admin through Spotify. */
export const GET: RequestHandler = ({ url, cookies }) => startAuthorization(url, cookies, 'signin')
