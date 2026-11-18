import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

/**
 * Opens a database by libsql URL; tests pass `file::memory:`. One connection: SQLite writes one at a
 * time anyway, and per-connection settings (foreign keys) then hold for every query.
 */
export function openDatabase(url: string) {
    return drizzle(createClient({ url, concurrency: 1 }), { schema })
}

export type Database = ReturnType<typeof openDatabase>
