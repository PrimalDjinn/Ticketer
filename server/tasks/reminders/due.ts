/**
 * Hourly (see `scheduledTasks` in nuxt.config.ts and `triggers.crons` in wrangler.jsonc): sends due-date reminders when
 * it's the hour chosen in Settings → Reminders.
 *
 * Notifications are delivered with request context (realtime to open tabs through the Durable Object on Cloudflare,
 * the EMAIL binding, push), so the job hands over to an internal route through Nitro's in-process fetch with the
 * Worker's bindings attached. Nothing outside the server can reach that route: it needs `scheduledJob` in the
 * request context, which only an in-process call can set.
 */
interface CloudflareJobContext {
  env: Record<string, unknown> & { $DurableObject?: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } } }
  context: { waitUntil(promise: Promise<unknown>): void }
}

export default defineTask({
  meta: { name: 'reminders:due', description: 'Remind people about tasks due today and tomorrow' },
  async run({ context }) {
    const log = useLogger('reminders')
    const origin = await knownSiteOrigin()
    if (!origin) {
      log.info('skipped: the site address is not known yet; it is learned when someone in the team opens Ticketer, or set NUXT_SITE_URL')
      return { result: 'skipped' }
    }
    const url = new URL(origin)
    const cf = (context as { cloudflare?: CloudflareJobContext } | undefined)?.cloudflare
    const durable = cf?.env.$DurableObject
    const response = await useNitroApp().localFetch('/_jobs/due-reminders', {
      method: 'POST',
      headers: { host: url.host, 'x-forwarded-proto': url.protocol.replace(':', '') },
      host: url.hostname,
      protocol: url.protocol,
      context: {
        waitUntil: cf ? (promise: Promise<unknown>) => cf.context.waitUntil(promise) : undefined,
        _platform: {
          scheduledJob: true,
          cloudflare: cf && {
            env: cf.env,
            context: cf.context,
            durableFetch: durable ? (req: Request) => durable.get(durable.idFromName('server')).fetch(req) : undefined,
          },
        },
      },
    } as RequestInit)
    const result = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`due reminders failed (${response.status}): ${JSON.stringify(result)}`)
    return { result }
  },
})
