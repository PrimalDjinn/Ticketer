import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({ name: z.string().trim().min(1).max(40), color: z.enum(PALETTE).default('neutral') })

export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const input = await readValidatedBody(event, body.parse)
  if (await db.query.labels.findFirst({ where: eq(schema.labels.name, input.name) })) {
    throw createError({ status: 409, message: 'A label with that name exists' })
  }
  const [label] = await db.insert(schema.labels).values(input).returning()
  publish(event, channels.members, { type: 'labels.updated', body: await allLabels() })
  return label
})
