/** Follow a ticket: notifications for replies, status changes and publishing. */
export default defineEventHandler(async (event) => {
  const user = await ticketViewer(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const ticket = await loadTicketFor(user, id)
  if (!ticketAccess.follow(user, ticket)) throw createError({ status: 401, message: 'Sign in to follow this ticket' })
  await watchTicket(id, user.id)
  return watcherState(id, user.id)
})
