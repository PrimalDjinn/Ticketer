/**
 * Fan-out entry point inside the Cloudflare Durable Object. The Worker calls it through `durableFetch` (see
 * `publish` in server/utils/realtime.ts); the realtime middleware refuses it from the outside world, and outside a
 * Durable Object it does not exist.
 */
export default defineEventHandler(async (event) => {
  const durable = event.context.cloudflare?.durable
  if (!durable) throw createError({ status: 404 })
  const { channels: targets, data } = await readBody<{ channels: string[]; data: string }>(event)
  deliver(targets, data, durable)
  return { ok: true }
})
