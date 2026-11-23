import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  await db.delete(schema.labels).where(eq(schema.labels.id, id))
  publish(event, channels.members, { type: 'labels.updated', body: await allLabels() })
  return { ok: true }
})
