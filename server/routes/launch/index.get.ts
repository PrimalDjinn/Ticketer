import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const appId = z.string().regex(/^app_[0-9a-z]{26}$/)

/**
 * Browser-facing launch link from another app.
 *  - Signed (`email`, `ts`, `nonce`, `sig` = hex HMAC-SHA256 of the canonical query with the app's signing secret):
 *    signs the (external) person in, optionally opens their ticket, and lands on the target.
 *  - Unsigned (no `email`/`sig`): no sign-in; opens the new-ticket form prefilled with `title`, `description`,
 *    `urgency` and `context[key]` entries.
 * Failures land on the sign-in page with an explanation (`?error=launch_…`).
 */
export default defineEventHandler(async (event) => {
  const log = useLogger('integrations')
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'referrer-policy', 'no-referrer')
  const fail = (reason: string) => sendRedirect(event, `/auth/login?error=launch_${reason}`, 302)

  const parsed = await getValidatedQuery(event, (value) => flatQueryShape.safeParse(value))
  if (!parsed.success) return fail('invalid')
  const query = parsed.data
  const id = appId.safeParse(query.app)
  if (!id.success) return fail('invalid')
  const app = await db.query.integrationApps.findFirst({ where: eq(schema.integrationApps.id, id.data) })
  if (!app) return fail('invalid')
  if (!app.enabled) {
    log.warn('launch for a disabled app', { appId: app.id })
    return fail('disabled')
  }
  const returnUrl = allowedReturnUrl(app, query.return_url)

  // Unsigned: only a prefilled form, nobody is signed in.
  if (!('sig' in query) && !('email' in query)) {
    const prefill = ticketInputShape.partial().safeParse({
      title: query.title?.trim() || undefined,
      description: query.description || undefined,
      urgency: query.urgency || undefined,
      context: contextFromQuery(query),
    })
    if (!prefill.success) log.warn('prefill launch with invalid fields; opening an empty form', { appId: app.id })
    setBackLink(event, app, returnUrl)
    log.info('prefill launch', { appId: app.id })
    return sendRedirect(event, prefillPath(app, prefill.success ? prefill.data : {}), 302)
  }

  try {
    await verifyLaunch(app, query)
  } catch (error) {
    if (error instanceof LaunchError) {
      log.warn('signed launch refused', { appId: app.id, reason: error.reason, detail: error.message })
      return fail(error.reason)
    }
    throw error
  }
  const input = sessionInputShape.safeParse(sessionInputFromQuery(query))
  if (!input.success) {
    log.warn('signed launch with invalid parameters', { appId: app.id, issues: input.error.issues.map((i) => i.message) })
    return fail('invalid')
  }

  try {
    const { user, created } = await findOrProvisionPerson(app, input.data, { guestId: await sessionGuestId(event) })
    const ticket = input.data.ticket ? await createReportedTicket(event, app, user, input.data.ticket) : null
    const target = await targetPath(app, user, { target: input.data.target, ticketId: input.data.ticketId, createdTicketId: ticket?.id })
    await startSession(event, user)
    setBackLink(event, app, returnUrl)
    await db
      .update(schema.integrationApps)
      .set({ signIns: sql`${schema.integrationApps.signIns} + 1`, lastUsedAt: new Date() })
      .where(eq(schema.integrationApps.id, app.id))
    log.info('signed in with a signed launch link', { appId: app.id, userId: user.id, created, target })
    return sendRedirect(event, target, 302)
  } catch (error) {
    const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500
    log.warn('signed launch failed', { appId: app.id, status, message: error instanceof Error ? error.message : String(error) })
    if (status === 409) return fail('team')
    if (status === 403) return fail('no_account')
    if (status === 404 || status === 400) return fail('invalid')
    throw error
  }
})
