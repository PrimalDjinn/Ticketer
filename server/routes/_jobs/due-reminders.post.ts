/** Internal: called in-process by the `reminders:due` scheduled task. Not reachable from outside (see that task). */
export default defineEventHandler(async (event) => {
  if (event.context.scheduledJob !== true) throw createError({ status: 404, message: 'Not found' })
  return sendDueReminders(event)
})
