import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  name: z.string().trim().min(1, 'Name the token').max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1, 'Choose at least one scope').max(API_SCOPES.length),
  /** Days until it stops working, or null for never. */
  expiresInDays: z.number().int().min(1).max(366).nullable().default(90),
})

/** Creates a personal access token for the team member asking. The token is in this answer only. */
export default defineEventHandler(async (event) => {
  const user = await requireInternal(event)
  if (!(await apiTokensEnabled())) throw createError({ status: 403, message: 'An admin has turned off access tokens' })
  const input = await readValidatedBody(event, body.parse)
  const [mine] = await db.select({ value: count() }).from(schema.apiTokens).where(eq(schema.apiTokens.userId, user.id))
  if ((mine?.value ?? 0) >= 25) throw createError({ status: 400, message: 'You have 25 tokens already. Revoke one you no longer use.' })
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null
  const { token, row } = await newPersonalToken(user.id, { name: input.name, scopes: [...new Set(input.scopes)], expiresAt })
  useLogger('api').info('token created', { user: user.id, prefix: row.keyPrefix, scopes: row.scopes })
  return { token, info: toApiTokenDTO(row) }
})
