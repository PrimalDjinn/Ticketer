import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z
  .object({
    status: z.enum(CONVERSATION_STATUSES).optional(),
    /** An admin or member, or null to unassign. */
    assigneeId: z.string().min(1).max(64).nullable().optional(),
    subject: conversationSubject.nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.assigneeId !== undefined || b.subject !== undefined, 'Nothing to change')

/** Team (admins and members): close or reopen, assign, rename. */
export default defineEventHandler(async (event): Promise<ConversationDTO> => {
  const user = await requireStaff(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const input = await readValidatedBody(event, body.parse)
  const { row } = await loadConversationFor(user, id)

  const patch: Partial<typeof schema.conversations.$inferInsert> = {}
  if (input.status && input.status !== row.status) {
    patch.status = input.status
    patch.closedAt = input.status === 'closed' ? new Date() : null
  }
  if (input.assigneeId !== undefined && input.assigneeId !== row.assigneeId) {
    if (input.assigneeId) await assertStaff(input.assigneeId)
    patch.assigneeId = input.assigneeId
  }
  if (input.subject !== undefined) patch.subject = input.subject

  const updated = Object.keys(patch).length
    ? (await db.update(schema.conversations).set(patch).where(eq(schema.conversations.id, row.id)).returning())[0]!
    : row
  if (updated !== row) await broadcastConversation(event, updated)

  if (patch.assigneeId && patch.assigneeId !== user.id) {
    const [dto] = await toConversationDTOs([updated], null)
    await notify(event, patch.assigneeId, {
      type: 'conversation',
      message: `${user.name} assigned you a conversation with ${dto!.customer.name}`,
      link: conversationLink(updated, false),
    })
  }
  return (await toConversationDTOs([updated], { id: user.id, asCustomer: false }))[0]!
})
