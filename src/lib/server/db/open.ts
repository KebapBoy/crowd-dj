import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

/**
 * Opens a database by libsql URL; tests pass `file::memory:`. One connection, as SQLite writes one
 * at a time anyway. libsql replaces a connection it had to drop without running anything on the new
 * one, so no setting may depend on a pragma: foreign keys are on by libsql's default (open.spec.ts).
 */
export function openDatabase(url: string) {
    return drizzle(createClient({ url, concurrency: 1 }), { schema })
}

export type Database = ReturnType<typeof openDatabase>
