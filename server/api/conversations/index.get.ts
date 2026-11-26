import { and, count, desc, eq, exists, isNull, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

export const query = z.object({
  /** Team default: open. People outside the team see all of their conversations unless they ask otherwise. */
  status: z.enum([...CONVERSATION_STATUSES, 'all']).optional(),
  /** Team only: `me`, `none`, `anyone`, or a person's id. */
  assignee: z.string().trim().min(1).max(64).optional(),
  /** Team only: customer name or email, subject, or message text. */
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  /** Alias of `pageSize` for small lists (home page). */
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

/** Escapes LIKE wildcards; used with `escape '\'`. */
function likeTerm(q: string) {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
}

/**
 * The support inbox for the team; for everyone else (external accounts and guests) their own conversations.
 * Each item carries a preview of the latest message the viewer may see and their unread count.
 */
export default defineEventHandler(async (event): Promise<ConversationPage> => {
  const sessionUser = (event.context.apiUser as PublicUser | undefined) ?? (await getUserSession(event)).user
  const input = await getValidatedQuery(event, query.parse)
  const pageSize = input.pageSize ?? input.limit ?? 30
  const empty = { items: [], total: 0, page: input.page, pageSize }
  if (!sessionUser) return empty

  const user = await withFreshRole(sessionUser)
  const team = user.isInternal
  const c = schema.conversations
  const where: (SQL | undefined)[] = []

  if (!team) where.push(eq(c.customerId, user.id))
  const status = input.status ?? (team ? 'open' : 'all')
  if (status !== 'all') where.push(eq(c.status, status))

  if (team && input.assignee && input.assignee !== 'anyone') {
    where.push(input.assignee === 'none' ? isNull(c.assigneeId) : eq(c.assigneeId, input.assignee === 'me' ? user.id : input.assignee))
  }

  if (team && input.q) {
    const term = likeTerm(input.q)
    const u = schema.users
    const m = schema.conversationMessages
    where.push(
      or(
        sql`${c.subject} like ${term} escape '\\'`,
        exists(
          db
            .select({ one: sql`1` })
            .from(u)
            .where(and(eq(u.id, c.customerId), or(sql`${u.name} like ${term} escape '\\'`, sql`${u.email} like ${term} escape '\\'`))),
        ),
        exists(
          db
            .select({ one: sql`1` })
            .from(m)
            .where(and(eq(m.conversationId, c.id), sql`${m.body} like ${term} escape '\\'`)),
        ),
      ),
    )
  }

  const filter = and(...where)
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(c)
      .where(filter)
      .orderBy(desc(sql`coalesce(${c.lastMessageAt}, ${c.createdAt})`), desc(c.id))
      .limit(pageSize)
      .offset((input.page - 1) * pageSize),
    db.select({ value: count() }).from(c).where(filter),
  ])

  return {
    items: await toConversationDTOs(rows, { id: user.id, asCustomer: !team }),
    total: total?.value ?? 0,
    page: input.page,
    pageSize,
  }
})
