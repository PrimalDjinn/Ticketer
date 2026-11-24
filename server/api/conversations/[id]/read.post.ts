/** Marks the conversation read for the current person (the team shows "Seen" to the customer and vice versa). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { row } = await loadConversationFor(user, id)
  const readAt = new Date()
  await markConversationRead(event, row, user.id, readAt)
  return { ok: true, readAt }
})
