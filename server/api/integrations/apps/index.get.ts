import { desc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Settings → Integrations: every app with its key prefix and usage. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const rows = await db.select().from(schema.integrationApps).orderBy(desc(schema.integrationApps.createdAt))
  return appDTOs(rows)
})
