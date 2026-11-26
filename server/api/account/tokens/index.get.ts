import { desc, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Your personal access tokens (never the tokens themselves: only their first characters). */
export default defineEventHandler(async (event) => {
  const user = await requireInternal(event)
  const rows = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.userId, user.id)).orderBy(desc(schema.apiTokens.createdAt))
  return { enabled: await apiTokensEnabled(), tokens: rows.map(toApiTokenDTO) }
})
