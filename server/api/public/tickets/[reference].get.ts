import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const params = z.object({ reference: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{8,32}$/) })

/** One public issue with its public replies. Private tickets (and unknown references) are simply "not found". */
export default defineEventHandler(async (event) => {
  const { reference } = await getValidatedRouterParams(event, params.parse)
  const ticket = await db.query.tickets.findFirst({ where: eq(schema.tickets.reference, reference) })
  if (!ticket || ticket.visibility !== 'public') throw createError({ status: 404, message: 'Issue not found' })
  const viewer = await optionalTicketViewer(event)
  // Personalised (viewer block), so it must not be shared from a cache.
  setHeader(event, 'cache-control', 'private, no-cache')
  return publicTicketDetail(ticket, viewer)
})
