/** The public VAPID key browsers need to subscribe to Web Push (created on first use). */
export default defineEventHandler(async (event) => {
  await requireMember(event)
  return { publicKey: (await vapidKeys()).publicKey }
})
