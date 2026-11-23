import { sql } from 'drizzle-orm'
import { db } from 'hub:db'

const log = useLogger('migrations')

/**
 * Node/Bun production: apply pending migrations to the SQLite file on boot. The file lives on the deployment volume,
 * which the build machine never sees, so NuxtHub's build-time migration step is disabled for this target.
 *
 * Bookkeeping matches NuxtHub and `wrangler d1 migrations apply` (`_hub_migrations`, one row per file name), so a
 * database can move between targets. Cloudflare applies migrations with `pnpm cf:migrate`; dev uses NuxtHub's own.
 */
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.dev) return
  if (useRuntimeConfig().hub.db?.driver !== 'libsql') return

  // Nitro does not await async plugins, so hold requests until the schema is in place.
  const ready = migrate().catch((error) => {
    log.error('failed', error)
    throw error
  })
  nitroApp.hooks.hook('request', () => ready)
})

async function migrate() {
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
    await db.transaction(async (tx) => {
      for (const statement of statements) await tx.run(sql.raw(statement))
      await tx.run(sql`INSERT INTO _hub_migrations (name) VALUES (${name})`)
    })
    log.success(`applied ${name}`)
  }
}
