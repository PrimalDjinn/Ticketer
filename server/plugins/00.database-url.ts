import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Node/Bun only. NuxtHub's libsql client takes TURSO_DATABASE_URL, then LIBSQL_URL, then the generic DATABASE_URL.
 * A DATABASE_URL meant for something else (a postgres:// URL from another project or an old .env) would crash every
 * query with URL_SCHEME_NOT_SUPPORTED, so in that case warn and fall back to the default SQLite file instead.
 * Also creates the directory of a `file:` database, which libsql will not do itself.
 * Runs before any other plugin touches the database (plugins load alphabetically).
 */
const SUPPORTED = /^(file|libsql|https?|wss?):/

export default defineNitroPlugin(() => {
  if (useRuntimeConfig().hub.db?.driver !== 'libsql') return
  const fallback = process.env.DATABASE_URL
  if (!process.env.TURSO_DATABASE_URL && !process.env.LIBSQL_URL && (!fallback || !SUPPORTED.test(fallback))) {
    if (fallback) {
      useLogger('database').warn(
        `DATABASE_URL uses "${fallback.split(':')[0]}:", which SQLite cannot open; using file:.data/db/sqlite.db. Set LIBSQL_URL to choose the database file.`,
      )
    }
    process.env.LIBSQL_URL = 'file:.data/db/sqlite.db'
  }

  const url = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || process.env.DATABASE_URL!
  if (url.startsWith('file:')) {
    const path = url.startsWith('file://') ? fileURLToPath(url) : url.slice('file:'.length)
    mkdirSync(dirname(path), { recursive: true })
  }
})
