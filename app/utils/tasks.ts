/** Static class lists per palette colour (Tailwind only ships classes it can see written out in full). */
export const colorClasses: Record<string, { dot: string; soft: string; text: string; ring: string }> = {
  neutral: { dot: 'bg-zinc-400', soft: 'bg-zinc-500/10', text: 'text-zinc-600 dark:text-zinc-300', ring: 'ring-zinc-500/30' },
  red: { dot: 'bg-red-500', soft: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', ring: 'ring-red-500/30' },
  orange: { dot: 'bg-orange-500', soft: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-500/30' },
  amber: { dot: 'bg-amber-500', soft: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/30' },
  yellow: { dot: 'bg-yellow-500', soft: 'bg-yellow-500/10', text: 'text-yellow-700 dark:text-yellow-400', ring: 'ring-yellow-500/30' },
  lime: { dot: 'bg-lime-500', soft: 'bg-lime-500/10', text: 'text-lime-700 dark:text-lime-400', ring: 'ring-lime-500/30' },
  green: { dot: 'bg-green-500', soft: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', ring: 'ring-green-500/30' },
  emerald: { dot: 'bg-emerald-500', soft: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/30' },
  teal: { dot: 'bg-teal-500', soft: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', ring: 'ring-teal-500/30' },
  cyan: { dot: 'bg-cyan-500', soft: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', ring: 'ring-cyan-500/30' },
  sky: { dot: 'bg-sky-500', soft: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', ring: 'ring-sky-500/30' },
  blue: { dot: 'bg-blue-500', soft: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500/30' },
  indigo: { dot: 'bg-indigo-500', soft: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-500/30' },
  violet: { dot: 'bg-violet-500', soft: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/30' },
  purple: { dot: 'bg-purple-500', soft: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', ring: 'ring-purple-500/30' },
  fuchsia: { dot: 'bg-fuchsia-500', soft: 'bg-fuchsia-500/10', text: 'text-fuchsia-600 dark:text-fuchsia-400', ring: 'ring-fuchsia-500/30' },
  pink: { dot: 'bg-pink-500', soft: 'bg-pink-500/10', text: 'text-pink-600 dark:text-pink-400', ring: 'ring-pink-500/30' },
  rose: { dot: 'bg-rose-500', soft: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500/30' },
}

export function color(name: string | null | undefined) {
  return colorClasses[name ?? 'neutral'] ?? colorClasses.neutral!
}

export const priorityMeta: Record<TaskPriority, { label: string; icon: string; class: string; rank: number }> = {
  urgent: { label: 'Urgent', icon: 'i-lucide-siren', class: 'text-error', rank: 4 },
  high: { label: 'High', icon: 'i-lucide-signal-high', class: 'text-warning', rank: 3 },
  medium: { label: 'Medium', icon: 'i-lucide-signal-medium', class: 'text-info', rank: 2 },
  low: { label: 'Low', icon: 'i-lucide-signal-low', class: 'text-muted', rank: 1 },
  none: { label: 'No priority', icon: 'i-lucide-minus', class: 'text-dimmed', rank: 0 },
}

/** Due-date tone: overdue, due within 2 days, or later. Dates are plain YYYY-MM-DD strings. */
export function dueState(due: string | null, done = false): 'overdue' | 'soon' | 'later' | null {
  if (!due || done) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = (new Date(`${due}T00:00:00`).getTime() - today.getTime()) / 86_400_000
  return days < 0 ? 'overdue' : days <= 2 ? 'soon' : 'later'
}

export function formatDay(day: string | null) {
  if (!day) return ''
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Fractional position between two neighbours (either may be missing at the ends of a column). */
export function positionBetween(before?: number, after?: number) {
  if (before === undefined && after === undefined) return 1024
  if (before === undefined) return after! - 1024
  if (after === undefined) return before + 1024
  return (before + after) / 2
}
