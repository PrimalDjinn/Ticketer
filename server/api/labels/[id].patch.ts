import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({ name: z.string().trim().min(1).max(40).optional(), color: z.enum(PALETTE).optional() })

export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const [label] = await db.update(schema.labels).set(await readValidatedBody(event, body.parse)).where(eq(schema.labels.id, id)).returning()
  if (!label) throw createError({ status: 404, message: 'Label not found' })
  publish(event, channels.members, { type: 'labels.updated', body: await allLabels() })
  return label
})
