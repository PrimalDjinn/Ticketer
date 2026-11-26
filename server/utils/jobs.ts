/**
 * Runs an internal job route in-process with request context, from a Nitro scheduled task. Jobs need request context
 * for notifications (realtime through the Durable Object on Cloudflare, the EMAIL binding, push), so the task hands
 * over to `/_jobs/<name>` through Nitro's local fetch with the Worker's bindings attached. Nothing outside the server
 * can reach those routes: they need `scheduledJob` in the request context, which only this in-process call sets.
 */
interface CloudflareJobContext {
  env: Record<string, unknown> & { $DurableObject?: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } } }
  context: { waitUntil(promise: Promise<unknown>): void }
}

export async function runJobRoute(taskContext: unknown, path: string, origin: string | null) {
  const url = new URL(origin ?? 'http://localhost')
  const cf = (taskContext as { cloudflare?: CloudflareJobContext } | undefined)?.cloudflare
  const durable = cf?.env.$DurableObject
  const response = await useNitroApp().localFetch(path, {
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
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${JSON.stringify(result)}`)
  return result
}
