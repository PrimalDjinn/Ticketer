import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({ email: z.boolean() })

export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const { email } = await readValidatedBody(event, body.parse)
  await db.update(schema.users).set({ emailNotifications: email }).where(eq(schema.users.id, user.id))
  return { email }
})
