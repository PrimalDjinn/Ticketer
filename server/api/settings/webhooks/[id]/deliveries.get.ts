/** The last 50 deliveries to this webhook (kept 7 days). */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, webhookIdParams.parse)
  return recentDeliveries(id)
})
