import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const query = z.object({ name: z.string().trim().min(1).max(30) })

export default defineEventHandler(async (event) => {
  const { name } = await getValidatedQuery(event, query.parse)
  const row = await db.query.users.findFirst({ where: eq(schema.users.name, name), columns: { id: true } })
  return { available: !row }
})
