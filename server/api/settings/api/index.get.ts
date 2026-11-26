import { desc, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Admins: whether tokens are allowed, and every token on this Ticketer with its owner. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const rows = await db
    .select({ token: schema.apiTokens, ownerName: schema.users.name, ownerId: schema.users.id })
    .from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
    .orderBy(desc(schema.apiTokens.createdAt))
  return {
    enabled: await apiTokensEnabled(),
    tokens: rows.map((r) => ({ ...toApiTokenDTO(r.token), owner: { id: r.ownerId, name: displayName({ id: r.ownerId, name: r.ownerName }) } })),
  }
})
