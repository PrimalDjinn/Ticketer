import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Issues a fresh link (the old one stops working), restarts the expiry and emails it again. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const invite = await db.query.invites.findFirst({ where: and(eq(schema.invites.id, id), isNull(schema.invites.acceptedAt)) })
  if (!invite) throw createError({ status: 404, message: 'Invitation not found' })
  return issueInvite(event, { id: invite.id, email: invite.email, role: invite.role }, admin)
})
