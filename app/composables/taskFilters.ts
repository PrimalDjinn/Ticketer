import { z } from 'zod'

export const TASK_SORTS = ['manual', 'priority', 'due', 'created', 'title'] as const
export type TaskSort = (typeof TASK_SORTS)[number]

export const taskSortLabels: Record<TaskSort, string> = {
  manual: 'Manual',
  priority: 'Priority',
  due: 'Due date',
  created: 'Created',
  title: 'Title',
}

/** Sentinel used in the `assignee` filter for tasks without an assignee. */
export const UNASSIGNED = 'none'

/** Comma separated list in a query param; anything that is not a single string reads as empty. */
const csv = z
  .string()
  .catch('')
  .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))

const priorities: readonly string[] = TASK_PRIORITIES

const filtersSchema = z.object({
  q: z.string().catch('').transform((value) => value.trim()),
  assignee: csv,
  priority: csv.transform((values) => values.filter((value): value is TaskPriority => priorities.includes(value))),
  label: csv.transform((values) => values.map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  sort: z.enum(TASK_SORTS).catch('manual'),
})

export type TaskFilters = z.output<typeof filtersSchema>

/** Board/list filters, kept in the URL query so every view is linkable. */
export function useTaskFilters() {
  const route = useRoute()
  const router = useRouter()

  const filters = computed<TaskFilters>(() => filtersSchema.parse(route.query))

  const active = computed(() => {
    const f = filters.value
    return !!(f.q || f.assignee.length || f.priority.length || f.label.length)
  })

  function setFilters(patch: Partial<TaskFilters>) {
    const next = { ...filters.value, ...patch }
    const query = { ...route.query }
    const write = (key: string, value: string) => {
      if (value) query[key] = value
      else delete query[key]
    }
    write('q', next.q)
    write('assignee', next.assignee.join(','))
    write('priority', next.priority.join(','))
    write('label', next.label.join(','))
    write('sort', next.sort === 'manual' ? '' : next.sort)
    router.replace({ query })
  }

  function clear() {
    setFilters({ q: '', assignee: [], priority: [], label: [] })
  }

  function matches(task: TaskDTO) {
    const f = filters.value
    if (f.q) {
      const needle = f.q.toLowerCase().replace(/^#/, '')
      const hit = task.title.toLowerCase().includes(needle) || task.ref.toLowerCase().includes(needle) || String(task.number) === needle
      if (!hit) return false
    }
    if (f.assignee.length && !f.assignee.includes(task.assigneeId ?? UNASSIGNED)) return false
    if (f.priority.length && !f.priority.includes(task.priority)) return false
    if (f.label.length && !task.labelIds.some((id) => f.label.includes(id))) return false
    return true
  }

  return { filters, active, setFilters, clear, matches }
}

const time = (value: string | number | Date | null | undefined) => (value == null ? 0 : new Date(value).getTime())

/** Returns a sorted copy; ties fall back to the manual (board) order. */
export function sortTasks(tasks: TaskDTO[], sort: TaskSort) {
  const manual = (a: TaskDTO, b: TaskDTO) => a.position - b.position || a.id - b.id
  const compare: Record<TaskSort, (a: TaskDTO, b: TaskDTO) => number> = {
    manual,
    priority: (a, b) => priorityMeta[b.priority].rank - priorityMeta[a.priority].rank || manual(a, b),
    // Tasks without a due date go last.
    due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || manual(a, b),
    created: (a, b) => time(b.createdAt) - time(a.createdAt) || b.id - a.id,
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || manual(a, b),
  }
  return [...tasks].sort(compare[sort])
}
