/**
 * On Cloudflare, realtime connections must all reach the same Durable Object instance, which is the only place that
 * holds them. WebSocket upgrades are routed there by Nitro itself; this forwards SSE and long-poll requests too.
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/_realtime/')) return
  const cf = event.context.cloudflare
  if (!cf?.durableFetch || cf.durable) return // Node, or already inside the Durable Object

  if (event.path.startsWith('/_realtime/publish')) {
    throw createError({ status: 404 })
  }
  return cf.durableFetch(cf.request)
})
