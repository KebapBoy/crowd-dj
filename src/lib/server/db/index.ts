import { openDatabase } from './open'
import { DATABASE_URL } from '$app/env/private'

export type { Database } from './open'

/** The app's database. */
export const db = openDatabase(DATABASE_URL)
