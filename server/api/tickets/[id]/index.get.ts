export default defineEventHandler(async (event) => {
  const user = await ticketViewer(event)
  const ticket = await loadTicketFor(user, (await getValidatedRouterParams(event, idParams.parse)).id)
  return ticketDetail(ticket, user)
})
