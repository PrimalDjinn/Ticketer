/** Internal: called in-process by the every-minute `webhooks:deliver` task. Not reachable from outside (utils/jobs.ts). */
export default defineEventHandler(async (event) => {
  if (event.context.scheduledJob !== true) throw createError({ status: 404, message: 'Not found' })
  return processDueDeliveries(event)
})
