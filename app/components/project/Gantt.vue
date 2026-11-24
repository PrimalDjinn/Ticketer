<script setup lang="ts">
import { z } from 'zod'
import type { TaskDates } from '~/utils/dates'

const props = defineProps<{
  statuses: StatusDTO[]
  tasks: TaskDTO[]
  members: PublicUser[]
  readonly?: boolean
}>()
const emit = defineEmits<{
  open: [task: TaskDTO]
  reschedule: [task: TaskDTO, dates: TaskDates]
}>()

const today = useToday()

// Zoom lives in the URL (?zoom=week) like the other view settings, so a shared link opens the same timeline.
const zoomSchema = z.enum(['day', 'week']).catch('day')
type Zoom = z.output<typeof zoomSchema>
const route = useRoute()
const router = useRouter()
const zoom = computed<Zoom>({
  get: () => zoomSchema.parse(route.query.zoom),
  set: (value) => router.replace({ query: { ...route.query, zoom: value === 'day' ? undefined : value } }),
})
const zoomItems = [
  { label: 'Days', value: 'day' },
  { label: 'Weeks', value: 'week' },
]
const dayWidth = computed(() => (zoom.value === 'day' ? 32 : 12))

// --- Rows ------------------------------------------------------------------------------------------------------------
/** First and last day a task occupies; a task with one date occupies that single day. */
function span(task: TaskDTO): [string, string] | null {
  const from = task.startDate ?? task.dueDate
  const to = task.dueDate ?? task.startDate
  if (!from || !to) return null
  return from <= to ? [from, to] : [to, from]
}

const scheduled = computed(() => props.tasks.filter((t) => t.startDate || t.dueDate))
const unscheduled = computed(() => props.tasks.filter((t) => !t.startDate && !t.dueDate).sort((a, b) => a.position - b.position || a.id - b.id))

const groups = computed(() => {
  const byStart = (a: TaskDTO, b: TaskDTO) => {
    const sa = span(a)!
    const sb = span(b)!
    return sa[0].localeCompare(sb[0]) || sa[1].localeCompare(sb[1]) || a.id - b.id
  }
  return [...props.statuses]
    .sort((a, b) => a.position - b.position)
    .map((status) => ({
      status,
      rows: scheduled.value
        .filter((t) => t.statusId === status.id)
        .sort(byStart)
        .map((task) => ({ task, bar: bar(task) })),
    }))
    .filter((g) => g.rows.length)
})

const collapsed = ref(new Set<number>())
function toggle(id: number) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

// --- Timeline range (whole weeks, padded around the tasks and today) --------------------------------------------------
const range = computed(() => {
  let lo = today.value
  let hi = today.value
  for (const task of scheduled.value) {
    const [from, to] = span(task)!
    if (from < lo) lo = from
    if (to > hi) hi = to
  }
  const start = startOfWeek(addDays(lo, -7))
  let end = addDays(startOfWeek(addDays(hi, 21)), 6)
  if (daysBetween(start, end) < 8 * 7) end = addDays(start, 8 * 7 - 1)
  return { start, end, days: daysBetween(start, end) + 1 }
})

const timelineWidth = computed(() => range.value.days * dayWidth.value)
const x = (day: string) => daysBetween(range.value.start, day) * dayWidth.value

const months = computed(() => {
  const segments: { month: string; left: number; width: number }[] = []
  let month = monthOf(range.value.start)
  while (firstOfMonth(month) <= range.value.end) {
    const from = firstOfMonth(month) < range.value.start ? range.value.start : firstOfMonth(month)
    const to = lastOfMonth(month) > range.value.end ? range.value.end : lastOfMonth(month)
    segments.push({ month, left: x(from), width: (daysBetween(from, to) + 1) * dayWidth.value })
    month = addMonths(month, 1)
  }
  return segments
})

const ticks = computed(() => {
  const days = dayRange(range.value.start, range.value.end)
  if (zoom.value === 'day') return days.map((day) => ({ day, label: day.slice(8).replace(/^0/, ''), width: dayWidth.value }))
  return days
    .filter((day) => weekdayIndex(day) === 0)
    .map((day) => ({ day, label: formatCalendarDay(day, { day: 'numeric', month: 'short' }), width: dayWidth.value * 7 }))
})

/** Day/week lines and weekend shading as one background; the range starts on a Monday so weeks line up. */
const gridBackground = computed(() => {
  const w = dayWidth.value
  const lines =
    zoom.value === 'day'
      ? `repeating-linear-gradient(to right, transparent 0 ${w - 1}px, var(--ui-border) ${w - 1}px ${w}px)`
      : `repeating-linear-gradient(to right, transparent 0 ${7 * w - 1}px, var(--ui-border) ${7 * w - 1}px ${7 * w}px)`
  const weekends = `repeating-linear-gradient(to right, transparent 0 ${5 * w}px, var(--ui-bg-elevated) ${5 * w}px ${7 * w}px)`
  return { backgroundImage: `${lines}, ${weekends}`, width: `${timelineWidth.value}px` }
})

const todayInRange = computed(() => today.value >= range.value.start && today.value <= range.value.end)

// --- Bars ------------------------------------------------------------------------------------------------------------
const statusById = computed(() => new Map(props.statuses.map((s) => [s.id, s])))
const membersById = computed(() => new Map(props.members.map((m) => [m.id, m])))

function bar(task: TaskDTO) {
  const [from, to] = span(task)!
  const milestone = !(task.startDate && task.dueDate)
  const status = statusById.value.get(task.statusId)
  return {
    milestone,
    left: x(from),
    width: (daysBetween(from, to) + 1) * dayWidth.value,
    done: status?.isDone ?? false,
    color: color(status?.color),
  }
}

const dateText = (day: string) => formatCalendarDay(day, { month: 'short', day: 'numeric' })
function barLabel(task: TaskDTO) {
  const dates = task.startDate && task.dueDate ? `${dateText(task.startDate)} to ${dateText(task.dueDate)}` : task.dueDate ? `due ${dateText(task.dueDate)}` : `starts ${dateText(task.startDate!)}`
  return `${task.ref} ${task.title}, ${dates}${task.blockedByCount ? ', blocked' : ''}`
}

// --- Drag to move / resize. The bar is moved through its inline style while dragging (no reactive state, so 200+
// rows never re-render per frame); the new dates are emitted on release. ----------------------------------------------
type Mode = 'move' | 'start' | 'end'
interface Drag {
  task: TaskDTO
  mode: Mode
  pointerId: number
  originX: number
  delta: number
  moved: boolean
  el: HTMLElement
  hint: HTMLElement | null
  style: { left: string; width: string }
  hintLeft: string
}
let drag: Drag | null = null
let suppressClick = false

function datesFor(task: TaskDTO, mode: Mode, delta: number): TaskDates {
  const [from, to] = span(task)!
  if (mode === 'move' || !(task.startDate && task.dueDate)) {
    return {
      startDate: task.startDate ? addDays(task.startDate, delta) : null,
      dueDate: task.dueDate ? addDays(task.dueDate, delta) : null,
    }
  }
  if (mode === 'start') {
    const start = addDays(from, delta)
    return { startDate: start > to ? to : start, dueDate: task.dueDate }
  }
  const end = addDays(to, delta)
  return { startDate: task.startDate, dueDate: end < from ? from : end }
}

function onPointerDown(event: PointerEvent, task: TaskDTO) {
  if (props.readonly || event.button !== 0) return
  const el = event.currentTarget as HTMLElement
  const edge = (event.target as HTMLElement).closest<HTMLElement>('[data-edge]')?.dataset.edge
  const hint = el.parentElement?.querySelector<HTMLElement>('[data-bar-label]') ?? null
  drag = {
    task,
    mode: edge === 'start' || edge === 'end' ? edge : 'move',
    pointerId: event.pointerId,
    originX: event.clientX,
    delta: 0,
    moved: false,
    el,
    hint,
    style: { left: el.style.left, width: el.style.width },
    hintLeft: hint?.style.left ?? '',
  }
  el.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  const dx = event.clientX - drag.originX
  if (!drag.moved && Math.abs(dx) < 4) return
  drag.moved = true
  const delta = Math.round(dx / dayWidth.value)
  if (delta === drag.delta) return
  drag.delta = delta
  const dates = datesFor(drag.task, drag.mode, delta)
  const [from, to] = span({ ...drag.task, ...dates })!
  const left = x(from)
  const width = (daysBetween(from, to) + 1) * dayWidth.value
  drag.el.style.left = `${left}px`
  if (!(drag.task.startDate && drag.task.dueDate)) {
    drag.el.style.left = `${left + width / 2}px` // milestones are centred on their day
  } else drag.el.style.width = `${width}px`
  if (drag.hint) {
    drag.hint.style.left = `${left + width + 6}px`
    const text = drag.hint.querySelector<HTMLElement>('[data-hint]')
    if (text) text.textContent = from === to ? dateText(from) : `${dateText(from)} – ${dateText(to)}`
  }
}

function endDrag(commit: boolean) {
  if (!drag) return
  const { task, mode, delta, moved, el, hint, style, hintLeft } = drag
  drag = null
  el.style.left = style.left
  el.style.width = style.width
  if (hint) {
    hint.style.left = hintLeft
    const text = hint.querySelector<HTMLElement>('[data-hint]')
    if (text) text.textContent = ''
  }
  if (moved) {
    suppressClick = true
    setTimeout(() => (suppressClick = false), 0)
  }
  if (commit && moved && delta !== 0) emit('reschedule', task, datesFor(task, mode, delta))
}

function onClick(task: TaskDTO) {
  if (!suppressClick) emit('open', task)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && drag) {
    event.preventDefault()
    endDrag(false)
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// --- Scroll today into view ------------------------------------------------------------------------------------------
const scroller = useTemplateRef<HTMLElement>('scroller')
function scrollToToday() {
  const el = scroller.value
  if (!el || !todayInRange.value) return
  el.scrollLeft = Math.max(0, x(today.value) - el.clientWidth / 3)
}
onMounted(() => nextTick(scrollToToday))
watch(zoom, () => nextTick(scrollToToday))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-2 border-b border-default px-4 py-2 sm:px-6">
      <p class="min-w-0 flex-1 truncate text-xs text-muted">
        {{ scheduled.length }} scheduled<span v-if="unscheduled.length"> · {{ unscheduled.length }} unscheduled</span>
        <span v-if="!readonly" class="hidden md:inline"> · Drag a bar to move it, or its edges to change the start or due date.</span>
      </p>
      <UButton size="xs" color="neutral" variant="outline" label="Today" @click="scrollToToday" />
      <UTabs v-model="zoom" :items="zoomItems" :content="false" size="xs" variant="pill" color="neutral" aria-label="Zoom" />
    </div>

    <div ref="scroller" class="relative min-h-0 flex-1 overflow-auto overscroll-contain [--gantt-left:9rem] sm:[--gantt-left:18rem]">
      <div class="relative min-w-full pb-8" :style="{ width: `calc(var(--gantt-left) + ${timelineWidth}px)` }">
        <!-- Grid lines, weekends and the today line, behind the rows -->
        <div class="pointer-events-none absolute inset-y-0 left-(--gantt-left)" :style="gridBackground" aria-hidden="true">
          <div v-if="todayInRange" class="absolute inset-y-0 w-0.5 bg-primary/70" :style="{ left: `${x(today) + dayWidth / 2 - 1}px` }" />
        </div>

        <!-- Header: months and days/weeks -->
        <div class="sticky top-0 z-20 flex border-b border-default bg-default">
          <div class="sticky left-0 z-10 flex w-(--gantt-left) shrink-0 items-end border-e border-default bg-default px-3 pb-1.5 text-xs font-medium text-muted">Task</div>
          <div class="relative shrink-0" :style="{ width: `${timelineWidth}px` }" aria-hidden="true">
            <div class="relative h-6 border-b border-default">
              <div v-for="m in months" :key="m.month" class="absolute inset-y-0 border-e border-default" :style="{ left: `${m.left}px`, width: `${m.width}px` }">
                <span class="sticky left-(--gantt-left) inline-block truncate px-2 text-xs leading-6 font-medium text-highlighted capitalize">{{ formatMonth(m.month) }}</span>
              </div>
            </div>
            <div class="flex h-6">
              <div
                v-for="tick in ticks"
                :key="tick.day"
                class="shrink-0 text-center text-[11px] leading-6 tabular-nums"
                :class="[
                  tick.day === today || (zoom === 'week' && today >= tick.day && today <= addDays(tick.day, 6))
                    ? 'font-semibold text-primary'
                    : zoom === 'day' && isWeekend(tick.day)
                      ? 'text-dimmed'
                      : 'text-muted',
                  zoom === 'week' && 'truncate px-1 text-left',
                ]"
                :style="{ width: `${tick.width}px` }"
              >
                {{ tick.label }}
              </div>
            </div>
          </div>
        </div>

        <p v-if="!scheduled.length" class="sticky left-0 w-[min(100%,100vw)] px-6 py-10 text-center text-sm text-muted">
          No task has a start or due date yet. Set dates on a task to see it here.
        </p>

        <!-- Rows, grouped by status -->
        <section v-for="{ status, rows } in groups" :key="status.id" :aria-label="status.name">
          <div class="relative flex h-8 items-center border-b border-default bg-elevated/70">
            <button
              type="button"
              class="sticky left-0 flex max-w-[100vw] items-center gap-2 px-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              :aria-expanded="!collapsed.has(status.id)"
              @click="toggle(status.id)"
            >
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed transition-transform" :class="!collapsed.has(status.id) && 'rotate-90'" />
              <span class="size-2 shrink-0 rounded-full" :class="color(status.color).dot" />
              <span class="truncate text-sm font-medium text-highlighted">{{ status.name }}</span>
              <span class="text-xs text-dimmed tabular-nums">{{ rows.length }}</span>
            </button>
          </div>
          <template v-if="!collapsed.has(status.id)">
            <div v-for="{ task, bar: b } in rows" :key="task.id" :data-task-id="task.id" class="group flex h-9 border-b border-default/60 hover:bg-elevated/30">
              <button
                type="button"
                class="sticky left-0 z-10 flex w-(--gantt-left) shrink-0 items-center gap-2 border-e border-default bg-default px-3 text-left text-sm group-hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                @click="emit('open', task)"
              >
                <span class="hidden w-14 shrink-0 font-mono text-xs text-dimmed sm:inline">{{ task.ref }}</span>
                <span class="min-w-0 flex-1 truncate" :class="b.done ? 'text-muted line-through decoration-muted' : 'text-highlighted'">{{ task.title }}</span>
                <UIcon v-if="task.blockedByCount" name="i-lucide-ban" class="size-3.5 shrink-0 text-error" aria-label="Blocked" />
                <UAvatar
                  v-if="task.assigneeId && membersById.get(task.assigneeId)"
                  :alt="membersById.get(task.assigneeId)!.name"
                  size="3xs"
                  class="hidden shrink-0 sm:inline-flex"
                  :title="membersById.get(task.assigneeId)!.name"
                />
              </button>
              <div class="relative shrink-0" :style="{ width: `${timelineWidth}px` }">
                <button
                  type="button"
                  data-bar
                  :aria-label="barLabel(task)"
                  :title="barLabel(task)"
                  class="absolute top-1/2 touch-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  :class="[
                    b.milestone ? 'size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px]' : 'h-5 -translate-y-1/2 rounded-md',
                    [b.color.dot, b.done && 'opacity-40'],
                    task.blockedByCount && 'outline-2 outline-offset-1 outline-error/70 outline-dashed',
                    readonly ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
                  ]"
                  :style="b.milestone ? { left: `${b.left + dayWidth / 2}px` } : { left: `${b.left}px`, width: `${b.width}px` }"
                  @pointerdown="onPointerDown($event, task)"
                  @pointermove="onPointerMove"
                  @pointerup="endDrag(true)"
                  @pointercancel="endDrag(false)"
                  @click="onClick(task)"
                >
                  <template v-if="!readonly && !b.milestone">
                    <span data-edge="start" class="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-s-md hover:bg-black/15 dark:hover:bg-white/20" />
                    <span data-edge="end" class="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-e-md hover:bg-black/15 dark:hover:bg-white/20" />
                  </template>
                </button>
                <span
                  data-bar-label
                  class="pointer-events-none absolute top-1/2 flex max-w-72 -translate-y-1/2 items-center gap-1.5 truncate text-xs whitespace-nowrap"
                  :class="b.done ? 'text-dimmed line-through' : 'text-muted'"
                  :style="{ left: `${b.left + (b.milestone ? dayWidth : b.width) + 6}px` }"
                  aria-hidden="true"
                >
                  <span data-hint class="font-medium text-primary empty:hidden" />
                  <UIcon v-if="task.blockedByCount" name="i-lucide-ban" class="size-3 shrink-0 text-error" />
                  <span class="truncate">{{ task.title }}</span>
                </span>
              </div>
            </div>
          </template>
        </section>

        <!-- Undated tasks -->
        <section v-if="unscheduled.length" aria-label="Unscheduled">
          <div class="relative flex h-8 items-center border-b border-default bg-elevated/70">
            <div class="sticky left-0 flex max-w-[100vw] items-center gap-2 px-3">
              <UIcon name="i-lucide-calendar-x" class="size-4 shrink-0 text-muted" />
              <span class="text-sm font-medium text-highlighted">Unscheduled</span>
              <span class="text-xs text-dimmed tabular-nums">{{ unscheduled.length }}</span>
              <span class="hidden truncate text-xs text-dimmed sm:inline">· Set a start or due date to place a task on the timeline.</span>
            </div>
          </div>
          <div v-for="task in unscheduled" :key="task.id" class="group flex h-9 border-b border-default/60">
            <button
              type="button"
              class="sticky left-0 z-10 flex w-(--gantt-left) shrink-0 items-center gap-2 border-e border-default bg-default px-3 text-left text-sm group-hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              @click="emit('open', task)"
            >
              <span class="hidden w-14 shrink-0 font-mono text-xs text-dimmed sm:inline">{{ task.ref }}</span>
              <span class="min-w-0 flex-1 truncate text-muted">{{ task.title }}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
