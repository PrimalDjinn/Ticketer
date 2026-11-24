import type { H3Event } from 'h3'
import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

/**
 * Due-date reminders. Once a day, at the hour an admin picks (in the team's time zone), people are reminded of open
 * tasks due tomorrow, and of tasks due today they weren't reminded about yet (the due date was set or moved after
 * yesterday's run). Each due date is reminded about once; moving the due date arms a new reminder.
 *
 * Who is reminded: the assignee, or the followers when nobody is assigned; anyone can turn reminders off in Account.
 * The scheduler (server/tasks/reminders/due.ts) runs every hour and only does work at the chosen hour.
 */

const log = useLogger('reminders')

export const reminderSettingsShape = z.object({
  enabled: z.boolean().default(true),
  hour: z.number().int().min(0).max(23).default(8),
  timeZone: z.string().refine(isTimeZone, 'Unknown time zone').default('UTC'),
})
export type ReminderSettings = z.output<typeof reminderSettingsShape>

export function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export async function reminderSettings(): Promise<ReminderSettings> {
  return (await getSetting('reminders', reminderSettingsShape)) ?? reminderSettingsShape.parse({})
}

/** "08:00 (Africa/Nairobi)" */
export function reminderScheduleText(settings: ReminderSettings) {
  return `${String(settings.hour).padStart(2, '0')}:00 (${settings.timeZone})`
}

/** The calendar date (YYYY-MM-DD) and hour at `now` in a time zone. */
export function zonedNow(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface ReminderRun {
  /** Why nothing was checked, when nothing was. */
  skipped?: 'disabled' | 'not-the-hour'
  tasks: number
  people: number
}

/**
 * Sends the reminders that are due. `force` ignores the hour (Settings → Reminders → "Send now"), never the
 * once-per-due-date rule, so running it twice sends nothing new.
 */
export async function sendDueReminders(event: H3Event, options: { now?: Date; force?: boolean } = {}): Promise<ReminderRun> {
  const settings = await reminderSettings()
  if (!settings.enabled) return { skipped: 'disabled', tasks: 0, people: 0 }
  const local = zonedNow(options.now ?? new Date(), settings.timeZone)
  if (!options.force && local.hour !== settings.hour) return { skipped: 'not-the-hour', tasks: 0, people: 0 }

  const today = local.date
  const tomorrow = addDays(today, 1)
  const due = await db
    .select({ id: schema.tasks.id, number: schema.tasks.number, title: schema.tasks.title, dueDate: schema.tasks.dueDate, assigneeId: schema.tasks.assigneeId, key: schema.projects.key })
    .from(schema.tasks)
    .innerJoin(schema.projectStatuses, eq(schema.tasks.statusId, schema.projectStatuses.id))
    .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.projectStatuses.isDone, false),
        inArray(schema.tasks.dueDate, [today, tomorrow]),
        or(isNull(schema.tasks.dueRemindedFor), ne(schema.tasks.dueRemindedFor, schema.tasks.dueDate)),
      ),
    )

  let tasks = 0
  const people = new Set<string>()
  for (const task of due) {
    // Claim the reminder first, so overlapping runs (several Node instances, a retried cron) send it once.
    const [claimed] = await db
      .update(schema.tasks)
      .set({ dueRemindedFor: task.dueDate })
      .where(and(eq(schema.tasks.id, task.id), or(isNull(schema.tasks.dueRemindedFor), ne(schema.tasks.dueRemindedFor, task.dueDate!))))
      .returning({ id: schema.tasks.id })
    if (!claimed) continue

    const recipients = await reminderRecipients(task.id, task.assigneeId)
    if (!recipients.length) continue
    const ref = `${task.key}-${task.number}`
    const when = task.dueDate === today ? 'today' : 'tomorrow'
    await notify(event, recipients, { type: 'reminder', message: `${ref} is due ${when}: ${task.title}`, link: `/projects/${task.key}/${task.number}` })
    tasks++
    for (const id of recipients) people.add(id)
  }
  if (tasks) log.info('sent due-date reminders', { tasks, people: people.size, date: today })
  return { tasks, people: people.size }
}

/** The assignee if there is one, else the followers; only people in the team who keep reminders on. */
async function reminderRecipients(taskId: number, assigneeId: string | null) {
  const wanted = and(eq(schema.users.taskReminders, true), eq(schema.users.isGuest, false), inArray(schema.users.role, [...INTERNAL_ROLES]))
  if (assigneeId) {
    const rows = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.id, assigneeId), wanted))
    return rows.map((r) => r.id)
  }
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.taskWatchers)
    .innerJoin(schema.users, eq(schema.taskWatchers.userId, schema.users.id))
    .where(and(eq(schema.taskWatchers.taskId, taskId), wanted))
  return rows.map((r) => r.id)
}

// ---------------------------------------------------------------------------------------------------------------------
// The site's address, for links in reminder emails
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Scheduled jobs have no incoming request to learn the site's address from. `NUXT_SITE_URL` sets it; otherwise the
 * address the team last used is remembered (see server/middleware/site-origin.ts).
 */
export async function knownSiteOrigin() {
  const configured = useRuntimeConfig().siteUrl
  if (configured) return new URL(configured).origin
  return (await getSetting('siteOrigin', z.url())) ?? null
}

let rememberedOrigin: string | undefined

/** Stores this request's origin when it differs from the remembered one (checked once per server instance). */
export function rememberSiteOrigin(event: H3Event) {
  if (useRuntimeConfig(event).siteUrl || event.context.scheduledJob) return
  const origin = siteOrigin(event)
  if (rememberedOrigin === origin) return
  rememberedOrigin = origin
  event.waitUntil(
    (async () => {
      if ((await getSetting('siteOrigin', z.url())) !== origin) await setSetting('siteOrigin', origin)
    })().catch((error) => {
      rememberedOrigin = undefined
      log.warn('could not remember the site address', error instanceof Error ? error.message : String(error))
    }),
  )
}
