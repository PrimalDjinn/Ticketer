import { desc, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Registered accounts, for the admin Users page. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const rows = await db.select().from(schema.users).where(eq(schema.users.isGuest, false)).orderBy(desc(schema.users.createdAt))
  return rows.map((u) => ({ ...toPublicUser(u), createdAt: u.createdAt }))
})
