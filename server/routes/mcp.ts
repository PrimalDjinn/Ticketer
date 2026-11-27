import type { H3Event } from 'h3'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { endpoints, type Endpoint } from '../v1/registry'

/**
 * Remote MCP server (rfcs/0001-apps-platform.md, phase 3) at `/mcp`, so AI assistants (Claude, ChatGPT, Cursor…)
 * can work with tickets, support chats and tasks. Stateless Streamable HTTP (MCP 2026-07-28), with the SDK's stateless
 * fallback for clients on the 2025 revisions.
 *
 * Auth is a personal access token, exactly as for `/api/v1`. Each tool is an `/api/v1` endpoint from the registry,
 * called in-process with the same token, so scopes, roles, hidden internal notes and email filtering behave exactly
 * as they do in the API. A token only sees the tools its scopes allow.
 */
const INSTRUCTIONS = `Ticketer is a help desk with tickets, support chats and project tasks.
- Find things first: list_tickets, search_tasks, list_conversations; then get_ticket, get_task, get_conversation for detail.
- reply_to_ticket and send_conversation_message are seen by the customer unless internal is true. Internal notes are seen only by the team. When in doubt, write an internal note and let a person send the reply.
- Ticket statuses: Open, Pending, Resolved, Closed. Task statuses are per project: read them with get_project and pass statusId.
- People and assignees are user IDs: get them from list_people or whoami.
- Errors explain what to change; a 403 means the token lacks a scope or the person's role doesn't allow it.`

const idParam = { integer: z.coerce.number().int().positive(), string: z.string().min(1).max(40) }

/** One input schema per tool: path parameters, then query or body fields, flat. */
function inputSchema(endpoint: Endpoint) {
  const shape: Record<string, z.ZodType> = {}
  for (const [name, type] of Object.entries(endpoint.params ?? {})) shape[name] = idParam[type].describe(`The ${name} in ${endpoint.path}`)
  for (const schema of [endpoint.query, endpoint.body]) {
    if (!(schema instanceof z.ZodObject)) continue
    for (const [name, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      // The API validates the real arguments; here a field only has to be describable. Dates can't be in JSON Schema,
      // so they're offered as text, which is how they travel in a query string anyway.
      shape[name] = describable(field) ? field : z.string().optional().describe(`${name} (ISO 8601 date)`)
    }
  }
  return z.object(shape)
}

function describable(field: z.ZodType) {
  try {
    z.toJSONSchema(field, { io: 'input' })
    return true
  } catch {
    return false
  }
}

interface ToolResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** Runs the endpoint in-process with the caller's token and turns the answer into a tool result. */
async function callEndpoint(event: H3Event, endpoint: Endpoint, args: Record<string, unknown>): Promise<ToolResult> {
  const rest = { ...args }
  const path = endpoint.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = rest[name]
    delete rest[name]
    return encodeURIComponent(String(value))
  })
  const withBody = endpoint.method === 'POST' || endpoint.method === 'PATCH'
  const query = new URLSearchParams()
  if (!withBody) for (const [name, value] of Object.entries(rest)) if (value !== undefined && value !== null) query.set(name, String(value))
  const url = `/api/v1${path}${query.size ? `?${query}` : ''}`

  const cf = event.context.cloudflare as { env?: unknown; context?: { waitUntil(p: Promise<unknown>): void } } | undefined
  const response = await useNitroApp().localFetch(url, {
    method: endpoint.method,
    headers: { authorization: getRequestHeader(event, 'authorization') ?? '', ...(withBody ? { 'content-type': 'application/json' } : {}) },
    body: withBody ? JSON.stringify(rest) : undefined,
    // Keep the Worker's bindings, so realtime updates and mail work for changes made through MCP.
    context: { waitUntil: cf?.context ? (p: Promise<unknown>) => cf.context!.waitUntil(p) : undefined, _platform: { cloudflare: event.context.cloudflare } },
  } as RequestInit)
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message ?? (typeof data === 'string' ? data : response.statusText)
    return { isError: true, content: [{ type: 'text', text: `${response.status}: ${message}` }] }
  }
  const structured = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : { data }
  return { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured }
}

function buildServer(event: H3Event, scopes: Set<string>) {
  const server = new McpServer({ name: 'ticketer', title: 'Ticketer', version: '1.0.0' }, { instructions: INSTRUCTIONS })
  // Deterministic order (registry order), and only what this token may use.
  for (const endpoint of endpoints) {
    if (endpoint.scope && !scopes.has(endpoint.scope)) continue
    server.registerTool(
      endpoint.tool.name,
      {
        title: endpoint.tool.title,
        description: [endpoint.summary, endpoint.description].filter(Boolean).join('. '),
        inputSchema: inputSchema(endpoint),
        annotations: {
          title: endpoint.tool.title,
          readOnlyHint: !!endpoint.tool.readOnly,
          destructiveHint: !!endpoint.tool.destructive,
          openWorldHint: false,
        },
      },
      (args: Record<string, unknown>) => callEndpoint(event, endpoint, args),
    )
  }
  return server
}

export default defineEventHandler(async (event) => {
  if (event.method === 'GET' && !getRequestHeader(event, 'accept')?.includes('text/event-stream')) {
    return { name: 'Ticketer MCP server', docs: 'https://primaldjinn.github.io/Ticketer/integrate/mcp', transport: 'streamable-http', endpoint: '/mcp' }
  }
  let auth: Awaited<ReturnType<typeof authenticateToken>>
  try {
    auth = await authenticateToken(event)
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 401
    setResponseStatus(event, status)
    if (status === 401) setHeader(event, 'WWW-Authenticate', 'Bearer realm="Ticketer", error="invalid_token"')
    return { error: (error as Error).message }
  }
  const scopes = event.context.apiScopes as Set<string>
  const handler = createMcpHandler(() => buildServer(event, scopes), { legacy: 'stateless' })
  return handler.fetch(toWebRequest(event), { authInfo: { token: auth.tokenId, clientId: 'personal-access-token', scopes: [...scopes] } })
})
