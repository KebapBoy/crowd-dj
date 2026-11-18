import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Instance-wide settings as key/value pairs, e.g. which connected account is the room account. */
export const setting = sqliteTable('setting', {
    key: text('key').primaryKey(),
    value: text('value').notNull()
})
