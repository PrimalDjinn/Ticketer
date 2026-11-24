import { sql } from 'drizzle-orm'
import { db } from 'hub:db'

const log = useLogger('migrations')

/**
 * Production: apply pending migrations before serving requests.
 *  - Node/Bun: the SQLite file lives on the deployment volume, which the build machine never sees, so NuxtHub's
 *    build-time migration step is disabled for this target.
 *  - Cloudflare: a fresh deployment (e.g. from the Deploy button) gets an empty D1 database; the Worker brings it up to
 *    date on its first request. CI may also run `wrangler d1 migrations apply` first; both use the same bookkeeping.
 *
 * Bookkeeping matches NuxtHub and `wrangler d1 migrations apply` (`_hub_migrations`, one row per file name), so a
 * database can move between targets. Dev uses NuxtHub's own migrator.
 */
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.dev) return
  const driver = useRuntimeConfig().hub.db?.driver
  if (driver !== 'libsql' && driver !== 'd1') return

  // Nitro does not await async plugins, so hold requests until the schema is in place. A failed attempt is retried on
  // the next request instead of wedging the isolate.
  let ready: Promise<void> | undefined
  nitroApp.hooks.hook('request', () => {
    ready ??= migrate(driver).catch((error) => {
      log.error('failed', error)
      ready = undefined
      throw error
    })
    return ready
  })
})

async function migrate(driver: 'libsql' | 'd1') {
  const storage = useStorage('assets:migrations')
  const files = (await storage.getKeys()).filter((key) => key.endsWith('.sql')).sort()

  await db.run(
    sql.raw(`CREATE TABLE IF NOT EXISTS _hub_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`),
  )
  const applied = new Set((await db.all<{ name: string }>(sql.raw('SELECT name FROM _hub_migrations'))).map((r) => r.name))

  for (const file of files) {
    const name = file.replace(/\.sql$/, '')
    if (applied.has(name)) continue
    const source = await storage.getItem<string>(file)
    if (!source) continue
    // drizzle-kit separates statements with this marker; plain files fall back to one statement per `;`.
    const statements = (source.includes('--> statement-breakpoint') ? source.split('--> statement-breakpoint') : source.split(/;\s*$/m))
      .map((s) => s.trim())
      .filter(Boolean)
    const record = sql`INSERT INTO _hub_migrations (name) VALUES (${name})`
    try {
      if (driver === 'd1') {
        // D1 has no interactive transactions; a batch on the raw binding runs atomically.
        const d1 = d1Binding()
        await d1.batch([...statements.map((statement) => d1.prepare(statement)), d1.prepare('INSERT INTO _hub_migrations (name) VALUES (?)').bind(name)])
      } else {
        await db.transaction(async (tx) => {
          for (const statement of statements) await tx.run(sql.raw(statement))
          await tx.run(record)
        })
      }
    } catch (error) {
      // Another isolate (or `wrangler d1 migrations apply`) may have applied it at the same moment.
      const done = await db.all<{ name: string }>(sql`SELECT name FROM _hub_migrations WHERE name = ${name}`)
      if (done.length) continue
      throw error
    }
    log.success(`applied ${name}`)
  }
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement
}
interface D1Like {
  prepare(query: string): D1Statement
  batch(statements: D1Statement[]): Promise<unknown>
}

/** The Worker's `DB` binding, found the same way NuxtHub's D1 client finds it. */
function d1Binding(): D1Like {
  const scope = globalThis as { __env__?: { DB?: D1Like }; DB?: D1Like }
  const binding = (process.env as Record<string, unknown>).DB ?? scope.__env__?.DB ?? scope.DB
  if (!binding || typeof (binding as D1Like).batch !== 'function') throw new Error('D1 binding DB not found')
  return binding as D1Like
}
