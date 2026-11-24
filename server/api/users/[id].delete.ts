import { z } from 'zod'

const params = z.object({ id: z.string().min(1).max(64) })
const query = z.object({ tickets: z.enum(['keep', 'delete']).default('keep') })

/** Admins erase someone else's account (e.g. a data-deletion request). Your own account: use the Account page. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, params.parse)
  const { tickets } = await getValidatedQuery(event, query.parse)
  if (id === admin.id) throw createError({ status: 409, message: 'Delete your own account from the Account page' })
  const summary = await deleteAccount(event, id, { tickets, via: 'admin', actorId: admin.id })
  return { ok: true, summary }
})
