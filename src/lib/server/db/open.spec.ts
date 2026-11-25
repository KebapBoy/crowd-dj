import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './open'

let dir: string | undefined

afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
})

describe('openDatabase', () => {
    // libsql replaces a connection it had to drop, and nothing sets pragmas on the new one: the
    // cascades of the schema rely on libsql's default
    it('enforces foreign keys on every connection without being told', async () => {
        dir = mkdtempSync(join(tmpdir(), 'crowd-dj-'))
        const db = openDatabase(`file:${join(dir, 'test.db')}`)
        const rows = await db.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`)
        expect(rows[0].foreign_keys).toBe(1)
        db.$client.close()
    })
})
