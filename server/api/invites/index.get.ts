import { desc, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { db, schema } from 'hub:db'

/** Invitations nobody has accepted yet (expired ones included, so they can be renewed). */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const inviter = alias(schema.users, 'inviter')
  const rows = await db
    .select({ invite: schema.invites, inviter: { id: inviter.id, name: inviter.name, isGuest: inviter.isGuest } })
    .from(schema.invites)
    .leftJoin(inviter, eq(inviter.id, schema.invites.invitedById))
    .where(isNull(schema.invites.acceptedAt))
    .orderBy(desc(schema.invites.createdAt))
  return rows.map((r) => inviteDTO(r.invite, r.inviter?.id ? displayName(r.inviter) : null))
})
