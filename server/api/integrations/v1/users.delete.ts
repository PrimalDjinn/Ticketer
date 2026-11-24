import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const query = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  /** keep: tickets stay, anonymised. delete: every ticket the person opened is deleted too. */
  tickets: z.enum(['keep', 'delete']).default('keep'),
})

/**
 * Erases a person on behalf of the app that brought them here (data-deletion requests). Key auth. The app needs
 * "Can delete people" enabled, and may only delete external people it has signed in or created — never team members.
 * Answers 204 also when no account uses the email, so the call can be safely repeated.
 */
export default defineEventHandler(async (event) => {
  const app = await requireIntegrationApp(event)
  if (!app.canDelete) throw createError({ status: 403, message: 'This integration may not delete people. An admin can allow it in Settings → Integrations.' })
  const input = await getValidatedQuery(event, query.parse)
  const log = useLogger('integrations')

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) })
  if (!user) {
    log.info('delete requested for an unknown email', { appId: app.id })
    setResponseStatus(event, 204)
    return null
  }
  if (isInternal(user)) throw createError({ status: 409, message: 'This person is on the team; an admin must remove them' })

  const [identity, link] = await Promise.all([
    db.query.userIdentities.findFirst({
      where: and(eq(schema.userIdentities.userId, user.id), eq(schema.userIdentities.provider, appProvider(app.id))),
      columns: { id: true },
    }),
    db.query.loginLinks.findFirst({ where: and(eq(schema.loginLinks.userId, user.id), eq(schema.loginLinks.appId, app.id)), columns: { id: true } }),
  ])
  if (!identity && !link) {
    throw createError({ status: 403, message: 'This person did not come through this integration; an admin can delete them from Members' })
  }

  const summary = await deleteAccount(event, user.id, { tickets: input.tickets, via: 'app', actorId: app.id })
  return { deleted: true, summary }
})
