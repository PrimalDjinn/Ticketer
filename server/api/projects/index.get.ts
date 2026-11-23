import { asc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  await requireMember(event)
  const rows = await db.select().from(schema.projects).orderBy(asc(schema.projects.name))
  return toProjectDTOs(rows)
})
