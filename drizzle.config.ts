import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    schema: './src/lib/server/db/schema.ts',
    out: './drizzle',
    dialect: 'sqlite',
    // Same default as src/env.ts; only db:push, db:migrate and db:studio connect
    dbCredentials: { url: process.env.DATABASE_URL || 'file:local.db' },
    verbose: true,
    strict: true
})
