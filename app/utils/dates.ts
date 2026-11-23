/**
 * Calendar-day helpers. Task dates are plain `YYYY-MM-DD` strings; all arithmetic happens on UTC midnights so a day
 * never shifts because of the viewer's timezone or a DST change. Months are `YYYY-MM` strings.
 */

/** The two schedulable dates of a task, as sent to `PATCH /api/tasks/:id`. */
export interface TaskDates {
  startDate: string | null
  dueDate: string | null
}

const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

/** UTC midnight (ms) of a `YYYY-MM-DD` day. */
export function dayToTime(day: string) {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
}

export function timeToDay(time: number) {
  return new Date(time).toISOString().slice(0, 10)
}

/** The viewer's local calendar day. */
export function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(day: string, days: number) {
  return timeToDay(dayToTime(day) + days * DAY_MS)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string) {
  return Math.round((dayToTime(to) - dayToTime(from)) / DAY_MS)
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: string) {
  return (new Date(dayToTime(day)).getUTCDay() + 6) % 7
}

export function isWeekend(day: string) {
  return weekdayIndex(day) >= 5
}

/** Monday of the week containing `day`. */
export function startOfWeek(day: string) {
  return addDays(day, -weekdayIndex(day))
}

export function monthOf(day: string) {
  return day.slice(0, 7)
}

export function addMonths(month: string, months: number) {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + months, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

export function firstOfMonth(month: string) {
  return `${month}-01`
}

export function lastOfMonth(month: string) {
  return addDays(firstOfMonth(addMonths(month, 1)), -1)
}

/** Days from `from` to `to`, both included. */
export function dayRange(from: string, to: string) {
  const days: string[] = []
  for (let t = dayToTime(from), end = dayToTime(to); t <= end; t += DAY_MS) days.push(timeToDay(t))
  return days
}

/** Locale formatting of a calendar day, pinned to UTC so the day itself never moves. */
export function formatCalendarDay(day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(dayToTime(day))
}

/** Locale weekday names, Monday first. */
export function weekdayNames(style: 'short' | 'narrow' | 'long' = 'short') {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => formatCalendarDay(addDays('2024-01-01', i), { weekday: style }))
}

export function formatMonth(month: string, style: 'long' | 'short' = 'long') {
  return formatCalendarDay(firstOfMonth(month), { month: style, year: 'numeric' })
}

/** Next occurrence of a repeating day; mirrors the server's rule (`server/utils/projects.ts`). */
export function nextRepeatDay(day: string, repeat: TaskRepeat, interval: number | null) {
  const d = new Date(dayToTime(day))
  if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1)
  else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else if (repeat === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  else if (repeat === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1)
  else d.setUTCDate(d.getUTCDate() + Math.max(1, interval ?? 1))
  return timeToDay(d.getTime())
}

/**
 * Projected future occurrences of a repeating task's due date that fall within [from, to], excluding the real due
 * date itself. Capped so a daily task anchored years ago cannot loop forever.
 */
export function projectedOccurrences(
  task: { dueDate: string | null; repeat: TaskRepeat | null; repeatInterval: number | null },
  from: string,
  to: string,
  cap = 60,
) {
  const days: string[] = []
  if (!task.dueDate || !task.repeat) return days
  let day = task.dueDate
  for (let i = 0; i < 5000 && days.length < cap; i++) {
    day = nextRepeatDay(day, task.repeat, task.repeatInterval)
    if (day > to) break
    if (day >= from) days.push(day)
  }
  return days
}
