/** Sends any reminders that are due now, without waiting for the scheduled hour. Each due date is still reminded once. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return sendDueReminders(event, { force: true })
})
