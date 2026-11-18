import { resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'
import type { Database } from './open'

/**
 * Migrations made by `npm run db:generate`. Relative to the working directory: the repository in
 * development, /app in the image (the Dockerfile copies them there).
 */
export const MIGRATIONS_FOLDER = resolve('drizzle')

/** Brings the database up to date; runs once when the server starts (`init` in hooks.server.ts). */
export async function migrateDatabase(database: Database, migrationsFolder = MIGRATIONS_FOLDER) {
    await database.run(sql`PRAGMA foreign_keys = ON`)
    await migrate(database, { migrationsFolder })
}
