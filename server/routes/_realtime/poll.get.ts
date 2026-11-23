import { z } from 'zod'

const query = z.object({ client: z.string().max(64).optional() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { client } = await getValidatedQuery(event, query.parse)
  setHeader(event, 'cache-control', 'no-store')
  return poll(event, user, client)
})
