import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({ email: z.boolean().optional(), taskReminders: z.boolean().optional() })

export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const { email, taskReminders } = await readValidatedBody(event, body.parse)
  if (email === undefined && taskReminders === undefined) return {}
  await db.update(schema.users).set({ emailNotifications: email, taskReminders }).where(eq(schema.users.id, user.id))
  return { email, taskReminders }
})
