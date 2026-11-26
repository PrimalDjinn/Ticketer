import { endpoints, type Endpoint } from '../../v1/registry'

/**
 * Router for the public API (`/api/v1/*`): finds the endpoint in the registry, authenticates the personal access
 * token, checks the endpoint's scope, runs the handler and shapes the answer. Browser sessions are never used here, so
 * these routes need no CSRF protection. See docs/reference/api.md.
 */
const routes = endpoints.map((endpoint) => ({
  endpoint,
  pattern: new RegExp(`^${endpoint.path.replace(/\{(\w+)\}/g, '(?<$1>[^/]+)')}$`),
}))

function match(path: string, method: string) {
  const candidates = routes.filter((r) => r.pattern.test(path))
  const found = candidates.find((r) => r.endpoint.method === method)
  return { found, allowed: [...new Set(candidates.map((r) => r.endpoint.method))] }
}

async function run(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0], endpoint: Endpoint) {
  let result = (await endpoint.handler(event)) as unknown
  if (endpoint.shape === 'list') {
    const page = result as { items: unknown[]; total: number; page: number; pageSize: number }
    result = { data: page.items, total: page.total, page: page.page, pageSize: page.pageSize, nextPage: page.page * page.pageSize < page.total ? page.page + 1 : null }
  }
  if (endpoint.transform) result = endpoint.transform(result, event)
  // Email addresses only with people:read (the token's own, from /me, is always fine).
  if (endpoint.path !== '/me' && !hasApiScope(event, 'people:read')) result = withoutEmails(result)
  return result ?? null
}

export default defineEventHandler(async (event) => {
  const path = `/${getRouterParam(event, 'path') ?? ''}`.replace(/\/+$/, '') || '/'
  const { found, allowed } = match(path, event.method)
  if (!found) {
    if (allowed.length) {
      setHeader(event, 'Allow', allowed.join(', '))
      throw apiError(405, 'method_not_allowed', `${event.method} isn't supported here; use ${allowed.join(' or ')}`)
    }
    throw apiError(404, 'not_found', `No endpoint ${event.method} /api/v1${path}. The list is at /api/v1/openapi.json.`)
  }
  const { tokenId } = await authenticateToken(event)
  if (found.endpoint.scope) requireApiScope(event, found.endpoint.scope)
  event.context.params = { ...event.context.params, ...(path.match(found.pattern)?.groups ?? {}) }
  return withIdempotency(event, `token:${tokenId}`, () => run(event, found.endpoint))
})
