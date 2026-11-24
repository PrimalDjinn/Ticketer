/** One conversation with its messages. The customer never receives internal notes. */
export default defineEventHandler(async (event): Promise<ConversationDetailDTO> => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { row, asCustomer } = await loadConversationFor(user, id)
  return conversationDetail(row, { id: user.id, asCustomer })
})
