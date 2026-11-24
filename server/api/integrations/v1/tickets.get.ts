import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const query = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  /** open = Open and Pending; closed = Resolved and Closed. */
  status: z.enum(['all', 'open', 'closed']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/** A person's own tickets, newest first, so the other app can show "your open issues". Key auth. */
export default defineEventHandler(async (event): Promise<IntegrationTicketDTO[]> => {
  const app = await requireIntegrationApp(event)
  const input = await getValidatedQuery(event, query.parse)
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) })
  if (!user) return []
  if (isInternal(user)) throw createError({ status: 409, message: 'This person is on the team; they must sign in directly' })

  const statuses = input.status === 'open' ? (['Open', 'Pending'] as const) : input.status === 'closed' ? (['Resolved', 'Closed'] as const) : null
  const rows = await db
    .select()
    .from(schema.tickets)
    .where(and(eq(schema.tickets.creatorId, user.id), statuses ? inArray(schema.tickets.status, [...statuses]) : undefined))
    .orderBy(desc(schema.tickets.createdAt))
    .limit(input.limit)
  useLogger('integrations').info('tickets listed', { appId: app.id, userId: user.id, count: rows.length })
  const origin = siteOrigin(event)
  return rows.map((t) => ({
    id: t.id,
    reference: t.reference,
    title: ticketTitle(t),
    status: t.status,
    urgency: t.urgency,
    visibility: t.visibility,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    url: `${origin}/tickets/${t.id}`,
    publicUrl: t.visibility === 'public' ? `${origin}/issues/${t.reference}` : null,
  }))
})
