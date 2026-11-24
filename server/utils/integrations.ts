import type { H3Event } from 'h3'
import { and, count, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { z } from 'zod'
import { db, schema } from 'hub:db'

/**
 * App integrations: another product sends its users here ("Report a problem", "Contact support"). Three ways in:
 *  - server to server: `POST /api/integrations/v1/sessions` (JSON) or `GET …/sessions?…` (302), API key in a header,
 *    answering with a single-use login link (`/launch/<token>`, 5 minutes);
 *  - a browser link signed with the app's signing secret: `/launch?app=…&email=…&ts=…&nonce=…&sig=…`;
 *  - an unsigned `/launch?app=…&title=…` that only prefills the new-ticket form (no sign-in).
 * Integration keys only ever sign in or create people outside the team (external accounts): a leaked key must never
 * yield a team session.
 */
const log = useLogger('integrations')

type AppRow = typeof schema.integrationApps.$inferSelect
type UserRow = typeof schema.users.$inferSelect

export const appProvider = (appId: string) => `app:${appId}`

// ---------------------------------------------------------------------------------------------------------------------
// Apps and credentials
// ---------------------------------------------------------------------------------------------------------------------

export async function newAppCredentials() {
  const apiKey = `tkt_${randomToken(24)}`
  const signingSecret = `tks_${randomToken(32)}`
  return {
    apiKey,
    signingSecret,
    columns: { keyHash: await sha256(apiKey), keyPrefix: apiKey.slice(0, 12), signingSecret: await encryptSecret(signingSecret) },
  }
}

export function newAppId() {
  return `app_${ulid().toLowerCase()}`
}

export async function appDTOs(rows: AppRow[]): Promise<IntegrationAppDTO[]> {
  if (!rows.length) return []
  const [names, people] = await Promise.all([
    namesFor(rows.map((r) => r.createdById)),
    db
      .select({ provider: schema.userIdentities.provider, value: count() })
      .from(schema.userIdentities)
      .where(inArray(schema.userIdentities.provider, rows.map((r) => appProvider(r.id))))
      .groupBy(schema.userIdentities.provider),
  ])
  const peopleBy = new Map(people.map((p) => [p.provider, p.value]))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    allowedOrigins: r.allowedOrigins,
    landing: r.landing,
    canProvision: r.canProvision,
    canDelete: r.canDelete,
    enabled: r.enabled,
    keyPrefix: r.keyPrefix,
    createdBy: r.createdById ? (names.get(r.createdById) ?? null) : null,
    createdAt: r.createdAt,
    rotatedAt: r.rotatedAt,
    lastUsedAt: r.lastUsedAt,
    apiCalls: r.apiCalls,
    signIns: r.signIns,
    ticketsCreated: r.ticketsCreated,
    people: peopleBy.get(appProvider(r.id)) ?? 0,
  }))
}

/** `https://app.example.com` from anything URL-shaped; null when it is not an http(s) origin. */
export function normaliseOrigin(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

const originList = z
  .array(z.string().trim().max(300))
  .max(20, 'At most 20 origins')
  .transform((list, ctx) => {
    const origins: string[] = []
    for (const value of list.filter(Boolean)) {
      const origin = normaliseOrigin(value)
      if (!origin) {
        ctx.addIssue({ code: 'custom', message: `"${value}" is not an http(s) origin like https://app.example.com` })
        return z.NEVER
      }
      if (!origins.includes(origin)) origins.push(origin)
    }
    return origins
  })

/** Create (all optional but the name) and update (all optional) input for an app. */
export const appInputShape = z.object({
  name: z.string().trim().min(1, 'Name the app').max(80),
  allowedOrigins: originList.optional(),
  landing: z.enum(INTEGRATION_LANDINGS).optional(),
  canProvision: z.boolean().optional(),
  canDelete: z.boolean().optional(),
})

/** A `returnUrl` is only kept when its origin is one the admin allowed for the app. */
export function allowedReturnUrl(app: Pick<AppRow, 'allowedOrigins'>, value: string | undefined | null) {
  if (!value) return null
  const origin = normaliseOrigin(value)
  if (!origin || !app.allowedOrigins.includes(origin)) return null
  return new URL(value).toString()
}

async function bump(appId: string, counters: { apiCalls?: number; signIns?: number; ticketsCreated?: number }) {
  await db
    .update(schema.integrationApps)
    .set({
      lastUsedAt: new Date(),
      apiCalls: sql`${schema.integrationApps.apiCalls} + ${counters.apiCalls ?? 0}`,
      signIns: sql`${schema.integrationApps.signIns} + ${counters.signIns ?? 0}`,
      ticketsCreated: sql`${schema.integrationApps.ticketsCreated} + ${counters.ticketsCreated ?? 0}`,
    })
    .where(eq(schema.integrationApps.id, appId))
}

// ---------------------------------------------------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------------------------------------------------

const keyHeader = z
  .string()
  .trim()
  .regex(/^tkt_[0-9a-f]{48}$/)

/** Constant-time comparison of two strings (hashes, signatures). */
export function safeEqual(a: string, b: string) {
  return timingSafeEqualText(a, b)
}

/** The app behind `Authorization: Bearer <key>` or `X-Api-Key: <key>`. 401 for a missing or wrong key, 403 if disabled. */
export async function requireIntegrationApp(event: H3Event) {
  const authorization = getRequestHeader(event, 'authorization')
  const raw = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? getRequestHeader(event, 'x-api-key')
  const key = keyHeader.safeParse(raw)
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? null
  if (!key.success) {
    log.warn('API call without a valid key', { path: event.path, ip })
    throw createError({ status: 401, message: 'Send the API key as "Authorization: Bearer <key>" or "X-Api-Key: <key>"' })
  }
  const hash = await sha256(key.data)
  const app = await db.query.integrationApps.findFirst({ where: eq(schema.integrationApps.keyHash, hash) })
  if (!app || !safeEqual(app.keyHash, hash)) {
    log.warn('API call with an unknown key', { path: event.path, prefix: key.data.slice(0, 12), ip })
    throw createError({ status: 401, message: 'Unknown API key' })
  }
  if (!app.enabled) {
    log.warn('API call for a disabled app', { appId: app.id, path: event.path, ip })
    throw createError({ status: 403, message: 'This integration is disabled' })
  }
  log.info('API call', { appId: app.id, app: app.name, method: event.method, path: event.path.split('?')[0], ip })
  await bump(app.id, { apiCalls: 1 })
  return app
}

// ---------------------------------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------------------------------

const contextShape = z
  .record(z.string().trim().min(1).max(60), z.string().max(2000))
  .refine((v) => Object.keys(v).length <= 30, 'At most 30 context entries')

export const ticketInputShape = z.object({
  title: z.string().trim().min(1, 'Give the ticket a title').max(140, 'Keep the title under 140 characters'),
  description: z.string().trim().max(8000, 'Keep the description under 8,000 characters').optional(),
  urgency: z.enum(TICKET_URGENCIES).optional(),
  context: contextShape.optional(),
})
export type TicketInput = z.output<typeof ticketInputShape>

export const sessionInputShape = z.object({
  email: z.email('Send a valid email address').transform((v) => v.trim().toLowerCase()),
  /** Display name; used to suggest a username for a new account. */
  name: z.string().trim().max(100).optional(),
  /** The person's id in the other app; links the account so a changed email still finds it. */
  externalId: z.string().trim().min(1).max(200).optional(),
  target: z.enum(INTEGRATION_TARGETS).optional(),
  ticketId: z.coerce.number().int().positive().optional(),
  ticket: ticketInputShape.optional(),
  returnUrl: z.url().max(2000).optional(),
})
export type SessionInput = z.output<typeof sessionInputShape>

/** Flat query parameters (`GET /sessions`, `/launch`): snake_case names, `context[key]=value` entries. */
export function contextFromQuery(query: Record<string, string>) {
  const context: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    const name = key.match(/^context\[(.+)\]$/)?.[1]
    if (name) context[name] = value
  }
  return Object.keys(context).length ? context : undefined
}

export function sessionInputFromQuery(query: Record<string, string>) {
  const context = contextFromQuery(query)
  const title = query.title?.trim()
  return {
    email: query.email,
    name: query.name || undefined,
    externalId: query.external_id || undefined,
    target: query.target || undefined,
    ticketId: query.ticket_id || undefined,
    ticket: title
      ? { title, description: query.description || undefined, urgency: query.urgency || undefined, context }
      : undefined,
    returnUrl: query.return_url || undefined,
  }
}

/** Query parameters as single strings; a repeated parameter is refused (it would make signatures ambiguous). */
export const flatQueryShape = z.record(z.string(), z.union([z.string(), z.array(z.string())])).transform((query, ctx) => {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      ctx.addIssue({ code: 'custom', message: `The parameter "${key}" is repeated` })
      return z.NEVER
    }
    flat[key] = value
  }
  return flat
})

// ---------------------------------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------------------------------

function refuseTeam(email: string, invited = false): never {
  log.warn(invited ? 'refused: the email has a pending team invitation' : 'refused: the email belongs to someone on the team', { email })
  throw createError({
    status: 409,
    message: invited ? 'This person is invited to the team; they must accept the invitation themselves' : 'This person is on the team; they must sign in directly',
  })
}

/**
 * The external account for this person: by the app's external id, else by email, else a new one (when the app may
 * create accounts). Anyone on the team is refused. Creating can upgrade the browser's guest row (signed links only).
 */
export async function findOrProvisionPerson(
  app: AppRow,
  input: Pick<SessionInput, 'email' | 'name' | 'externalId'>,
  options: { guestId?: string | null } = {},
): Promise<{ user: UserRow; created: boolean }> {
  const provider = appProvider(app.id)
  let user: UserRow | null = null
  if (input.externalId) {
    const linked = await findIdentityUser(provider, input.externalId)
    if (linked) {
      user = linked.user
      await touchIdentity(linked.identityId, input.email)
    }
  }
  user ??= (await db.query.users.findFirst({ where: eq(schema.users.email, input.email) })) ?? null

  if (user) {
    if (isInternal(user)) refuseTeam(input.email)
    if (input.externalId) await linkIdentity(provider, input.externalId, user.id, input.email)
    return { user, created: false }
  }

  if (!app.canProvision) {
    throw createError({ status: 403, message: 'No account uses this email, and this integration may not create accounts' })
  }
  // An invitation to the team must be accepted by the person themselves; an external one is consumed here.
  const invite = await findPendingInviteByEmail(input.email)
  if (invite && isInternal({ role: invite.role })) refuseTeam(input.email, true)
  if (invite && !(await claimInvite(invite.id))) throw createError({ status: 409, message: 'An invitation for this email was just used' })

  const values = {
    email: input.email,
    name: await uniqueUsername(input.name, input.email.split('@')[0]),
    role: 'external' as const,
    isGuest: false,
  }
  const [created] = options.guestId
    ? await db.update(schema.users).set(values).where(and(eq(schema.users.id, options.guestId), eq(schema.users.isGuest, true))).returning()
    : await db.insert(schema.users).values({ id: ulid(), ...values }).returning()
  if (!created) throw createError({ status: 409, message: 'Could not create the account, try again' })
  if (invite) await markInviteAccepted(invite.id, created.id)
  await linkIdentity(provider, input.externalId ?? `email:${input.email}`, created.id, input.email)
  log.info('created an external account', { appId: app.id, userId: created.id, upgradedGuest: !!options.guestId, invite: !!invite })
  return { user: created, created: true }
}

// ---------------------------------------------------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------------------------------------------------

/** "Reported from <app>" plus the context the app sent, one `key: value` per line. */
export function reportFooter(app: Pick<AppRow, 'name'>, context?: Record<string, string>) {
  const lines = Object.entries(context ?? {}).map(([key, value]) => `${key.replace(/[\r\n]+/g, ' ')}: ${value.replace(/[\r\n]+/g, ' ').trim()}`)
  return ['———', `Reported from ${app.name}`, ...lines].join('\n')
}

/** The description with the "Reported from" section under it. */
export function reportDescription(app: Pick<AppRow, 'name'>, ticket: Pick<TicketInput, 'title' | 'description' | 'context'>) {
  const body = ticket.description?.trim() || ticket.title
  return `${body}\n\n${reportFooter(app, ticket.context)}`.slice(0, 10_000)
}

/** Opens the ticket on the person's behalf; they follow it, and the team hears about it like any new ticket. */
export async function createReportedTicket(event: H3Event, app: AppRow, user: UserRow, ticket: TicketInput) {
  const [row] = await db
    .insert(schema.tickets)
    .values({
      reference: ulid(),
      title: ticket.title,
      info: reportDescription(app, ticket),
      urgency: ticket.urgency ?? 'Default',
      creatorId: user.id,
    })
    .returning()
  await watchTicket(row!.id, user.id)
  await broadcastTicket(event, row!, 'ticket.created')
  const what = row!.urgency === 'Default' ? 'a ticket' : `an ${row!.urgency.toLowerCase()} ticket`
  await notify(event, await adminIds(), {
    type: 'ticket',
    message: `${displayName(user)} opened ${what} from ${app.name}: ${quotedTitle(row!)}`,
    link: ticketLink(row!),
  })
  await bump(app.id, { ticketsCreated: 1 })
  log.info('ticket created', { appId: app.id, userId: user.id, ticketId: row!.id })
  return row!
}

// ---------------------------------------------------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------------------------------------------------

/** Where to send the person: always an internal path built here, never a URL from the request. */
export async function targetPath(
  app: AppRow,
  user: Pick<UserRow, 'id'> | null,
  input: { target?: IntegrationTarget; ticketId?: number; createdTicketId?: number },
) {
  if (input.createdTicketId && (!input.target || input.target === 'ticket')) return `/tickets/${input.createdTicketId}`
  const target = input.target ?? app.landing
  if (target === 'ticket') {
    if (!input.ticketId) throw createError({ status: 400, message: 'target "ticket" needs ticketId' })
    const ticket = await db.query.tickets.findFirst({ where: eq(schema.tickets.id, input.ticketId), columns: { id: true, creatorId: true, visibility: true } })
    const visible = ticket && (ticket.visibility === 'public' || (user && ticket.creatorId === user.id))
    if (!visible) throw createError({ status: 404, message: 'Ticket not found for this person' })
    return `/tickets/${ticket.id}`
  }
  if (target === 'chat') return '/?support=chat'
  if (target === 'tickets') return '/tickets'
  return '/tickets/new'
}

/** The new-ticket form, prefilled (the page reads `title`, `description`, `urgency`, `source`). */
export function prefillPath(app: Pick<AppRow, 'name'>, ticket?: Partial<TicketInput>) {
  const params = new URLSearchParams()
  if (ticket?.title) params.set('title', ticket.title)
  const description = ticket?.description?.trim()
  if (description || ticket?.context) params.set('description', [description, reportFooter(app, ticket?.context)].filter(Boolean).join('\n\n').slice(0, 10_000))
  if (ticket?.urgency) params.set('urgency', ticket.urgency)
  params.set('source', app.name)
  return `/tickets/new?${params}`
}

// ---------------------------------------------------------------------------------------------------------------------
// Login links and the "Back to <app>" cookie
// ---------------------------------------------------------------------------------------------------------------------

export async function issueLoginLink(event: H3Event, app: AppRow, user: UserRow, target: string, returnUrl: string | null) {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + LOGIN_LINK_TTL_SECONDS * 1000)
  await db.insert(schema.loginLinks).values({ tokenHash: await sha256(token), userId: user.id, appId: app.id, target, returnUrl, expiresAt })
  await pruneExpired()
  return { url: `${siteOrigin(event)}/launch/${token}`, expiresAt }
}

type Redeemed = { ok: true; user: UserRow; app: AppRow | null; target: string; returnUrl: string | null } | { ok: false; reason: 'invalid' | 'used' | 'expired' | 'disabled' | 'team' }

/** Uses a login link once. */
export async function redeemLoginLink(token: string): Promise<Redeemed> {
  const hash = await sha256(token)
  const link = await db.query.loginLinks.findFirst({ where: eq(schema.loginLinks.tokenHash, hash) })
  if (!link) return { ok: false, reason: 'invalid' }
  if (link.usedAt) return { ok: false, reason: 'used' }
  if (link.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' }
  const claimed = await db
    .update(schema.loginLinks)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.loginLinks.id, link.id), isNull(schema.loginLinks.usedAt), gt(schema.loginLinks.expiresAt, new Date())))
    .returning({ id: schema.loginLinks.id })
  if (!claimed.length) return { ok: false, reason: 'used' }

  const app = link.appId ? ((await db.query.integrationApps.findFirst({ where: eq(schema.integrationApps.id, link.appId) })) ?? null) : null
  if (link.appId && !app?.enabled) return { ok: false, reason: 'disabled' }
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, link.userId) })
  if (!user) return { ok: false, reason: 'invalid' }
  // Promoted to the team since the link was made: they must sign in themselves.
  if (isInternal(user)) return { ok: false, reason: 'team' }
  if (app) await bump(app.id, { signIns: 1 })
  return { ok: true, user, app, target: link.target, returnUrl: link.returnUrl }
}

export const BACK_COOKIE = 'ticketer-back'

/** Remembers "Back to <app>" for the session's pages (read by the app's back-link banner). */
export function setBackLink(event: H3Event, app: Pick<AppRow, 'name'>, returnUrl: string | null) {
  if (!returnUrl) return
  setCookie(event, BACK_COOKIE, JSON.stringify({ name: app.name, url: returnUrl }), {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12,
    secure: siteOrigin(event).startsWith('https:'),
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Signed launch links
// ---------------------------------------------------------------------------------------------------------------------

const signedShape = z.object({
  ts: z.coerce.number().int().positive(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, 'nonce must be 16-128 letters, digits, - or _'),
  sig: z.string().regex(/^[0-9a-fA-F]{64}$/, 'sig must be a hex HMAC-SHA256'),
})

export async function hmacHex(secret: string, message: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class LaunchError extends Error {
  constructor(
    public reason: 'signature' | 'expired' | 'replayed' | 'disabled' | 'invalid' | 'team' | 'no_account',
    message: string,
  ) {
    super(message)
  }
}

/** Checks a signed launch link: signature first (so strangers cannot burn nonces), then age, then the nonce. */
export async function verifyLaunch(app: AppRow, query: Record<string, string>) {
  const parsed = signedShape.safeParse(query)
  if (!parsed.success) throw new LaunchError('invalid', parsed.error.issues.map((i) => i.message).join('; '))
  const secret = await decryptSecret(app.signingSecret)
  if (!secret) throw new LaunchError('signature', 'The signing secret cannot be read on this server; rotate it')
  const expected = await hmacHex(secret, canonicalLaunchString(Object.entries(query)))
  if (!safeEqual(expected, parsed.data.sig.toLowerCase())) throw new LaunchError('signature', 'The signature does not match')

  const now = Math.floor(Date.now() / 1000)
  if (parsed.data.ts < now - LAUNCH_MAX_AGE_SECONDS) throw new LaunchError('expired', 'The link is older than 5 minutes')
  if (parsed.data.ts > now + LAUNCH_MAX_SKEW_SECONDS) throw new LaunchError('expired', 'The link is dated in the future (check the clocks)')

  const seen = await db
    .insert(schema.integrationNonces)
    .values({ appId: app.id, nonce: parsed.data.nonce, expiresAt: new Date((parsed.data.ts + LAUNCH_MAX_AGE_SECONDS + LAUNCH_MAX_SKEW_SECONDS) * 1000) })
    .onConflictDoNothing()
    .returning({ nonce: schema.integrationNonces.nonce })
  if (!seen.length) throw new LaunchError('replayed', 'This link was already used')
  await pruneExpired()
}

/** Clears used-up nonces and old login links now and then (cheap, indexed deletes). */
async function pruneExpired() {
  if (Math.random() > 0.1) return
  const now = new Date()
  await db.delete(schema.integrationNonces).where(lt(schema.integrationNonces.expiresAt, now))
  await db.delete(schema.loginLinks).where(lt(schema.loginLinks.expiresAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)))
}

/** Removes everything an app leaves behind besides tickets: identities pointing at it. */
export async function forgetAppIdentities(appId: string) {
  await db.delete(schema.userIdentities).where(eq(schema.userIdentities.provider, appProvider(appId)))
}

/**
 * The server-to-server flow behind `POST`/`GET /api/integrations/v1/sessions`: find or create the person, optionally
 * open their ticket, and hand back a single-use login link that lands on the target.
 */
export async function startIntegrationSession(event: H3Event, app: AppRow, input: SessionInput): Promise<IntegrationSessionResult> {
  // Reject a bad target before an account is created or an invitation used up.
  if ((input.target ?? app.landing) === 'ticket' && !input.ticket) {
    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, input.email), columns: { id: true } })
    await targetPath(app, existing ?? null, { target: 'ticket', ticketId: input.ticketId })
  }
  const { user, created } = await findOrProvisionPerson(app, input)
  const ticket = input.ticket ? await createReportedTicket(event, app, user, input.ticket) : null
  const target = await targetPath(app, user, { target: input.target, ticketId: input.ticketId, createdTicketId: ticket?.id })
  const returnUrl = allowedReturnUrl(app, input.returnUrl)
  if (input.returnUrl && !returnUrl) log.warn('ignoring a returnUrl outside the allowed origins', { appId: app.id })
  const link = await issueLoginLink(event, app, user, target, returnUrl)
  log.info('login link issued', { appId: app.id, userId: user.id, target, created })
  const origin = siteOrigin(event)
  return {
    url: link.url,
    expiresAt: link.expiresAt,
    userId: user.id,
    created,
    ...(ticket && { ticket: { id: ticket.id, reference: ticket.reference, url: `${origin}/tickets/${ticket.id}` } }),
  }
}
