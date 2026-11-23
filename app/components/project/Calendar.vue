<script setup lang="ts">
import { z } from 'zod'
import type { TaskDates } from '~/utils/dates'

const props = defineProps<{
  projectKey: string
  statuses: StatusDTO[]
  tasks: TaskDTO[]
  members: PublicUser[]
  readonly?: boolean
}>()
const emit = defineEmits<{
  open: [task: TaskDTO]
  reschedule: [task: TaskDTO, dates: TaskDates]
  created: [task: TaskDTO]
}>()

const route = useRoute()
const router = useRouter()
const toast = useToast()
const today = useToday()

// --- Visible month (URL: ?month=YYYY-MM, defaults to the current month) ------------------------------------------------
const monthQuery = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .nullable()
  .catch(null)
const month = computed(() => monthQuery.parse(route.query.month ?? null) ?? monthOf(today.value))

function setMonth(value: string) {
  router.replace({ query: { ...route.query, month: value === monthOf(today.value) ? undefined : value } })
}

const weekdays = weekdayNames('short')
const days = computed(() => {
  const first = firstOfMonth(month.value)
  return dayRange(startOfWeek(first), addDays(startOfWeek(lastOfMonth(month.value)), 6))
})

// --- Tasks per day ---------------------------------------------------------------------------------------------------
const statusById = computed(() => new Map(props.statuses.map((s) => [s.id, s])))
const membersById = computed(() => new Map(props.members.map((m) => [m.id, m])))
const isDone = (task: TaskDTO) => statusById.value.get(task.statusId)?.isDone ?? false
const assigneeOf = (task: TaskDTO) => (task.assigneeId ? (membersById.value.get(task.assigneeId) ?? null) : null)

interface Entry {
  key: string
  task: TaskDTO
  /** Set for projected occurrences of a repeating task. */
  ghostDay: string | null
}

const byDay = computed(() => {
  const from = days.value[0]!
  const to = days.value.at(-1)!
  const map = new Map<string, Entry[]>()
  const add = (day: string, entry: Entry) => {
    const list = map.get(day)
    if (list) list.push(entry)
    else map.set(day, [entry])
  }
  for (const task of props.tasks) {
    if (!task.dueDate) continue
    if (task.dueDate >= from && task.dueDate <= to) add(task.dueDate, { key: String(task.id), task, ghostDay: null })
    // A done repeating task already spawned its next occurrence as a real task.
    if (task.repeat && !isDone(task)) {
      for (const day of projectedOccurrences(task, from, to)) add(day, { key: `${task.id}@${day}`, task, ghostDay: day })
    }
  }
  const rank = (e: Entry) => (e.ghostDay ? 1 : 0) * 10 + (isDone(e.task) ? 5 : 0) - priorityMeta[e.task.priority].rank
  for (const list of map.values()) list.sort((a, b) => rank(a) - rank(b) || a.task.title.localeCompare(b.task.title))
  return map
})

const agenda = computed(() =>
  dayRange(firstOfMonth(month.value), lastOfMonth(month.value))
    .map((day) => ({ day, entries: byDay.value.get(day) ?? [] }))
    .filter((d) => d.entries.length),
)

const undated = computed(() => props.tasks.filter((t) => !t.dueDate).sort((a, b) => a.position - b.position || a.id - b.id))
const trayOpen = ref(true)

// --- Drag to reschedule (native drag and drop; the mobile agenda does not drag) ---------------------------------------
const draggingId = ref<number | null>(null)
const dropTarget = ref<string | null>(null) // a day, or 'tray'

function onDragStart(event: DragEvent, task: TaskDTO) {
  if (props.readonly || !event.dataTransfer) return
  event.dataTransfer.setData('text/plain', String(task.id))
  event.dataTransfer.effectAllowed = 'move'
  draggingId.value = task.id
}
function onDragEnd() {
  draggingId.value = null
  dropTarget.value = null
}
function onDragOver(event: DragEvent, target: string) {
  if (draggingId.value === null) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTarget.value = target
}
function onDragLeave(event: DragEvent, target: string) {
  const to = event.relatedTarget
  if (to instanceof Node && (event.currentTarget as HTMLElement).contains(to)) return
  if (dropTarget.value === target) dropTarget.value = null
}
function onDrop(event: DragEvent, day: string | null) {
  event.preventDefault()
  const task = props.tasks.find((t) => t.id === draggingId.value)
  onDragEnd()
  if (!task || task.dueDate === day) return
  let startDate = task.startDate
  if (day === null) {
    // Back to the tray: keep the start date, drop the due date.
  } else if (task.dueDate && task.startDate) {
    startDate = addDays(task.startDate, daysBetween(task.dueDate, day))
  } else if (task.startDate && task.startDate > day) {
    startDate = day
  }
  emit('reschedule', task, { startDate, dueDate: day })
}

// --- Quick create on a day -------------------------------------------------------------------------------------------
const creatingDay = ref<string | null>(null)
const newTitle = ref('')
const saving = ref(false)

function setCreating(day: string, open: boolean) {
  if (open) {
    creatingDay.value = day
    newTitle.value = ''
  } else if (creatingDay.value === day) creatingDay.value = null
}

async function create() {
  const title = newTitle.value.trim()
  const dueDate = creatingDay.value
  if (!title || !dueDate || saving.value) return
  saving.value = true
  try {
    const task = await $fetch<TaskDTO>(`/api/projects/${props.projectKey}/tasks`, { method: 'POST', body: { title, dueDate } })
    emit('created', task)
    creatingDay.value = null
  } catch (e) {
    toast.add({ title: 'Could not create the task', description: errorMessage(e), color: 'error' })
  } finally {
    saving.value = false
  }
}

const dayLabel = (day: string) => formatCalendarDay(day, { weekday: 'long', month: 'long', day: 'numeric' })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-2 border-b border-default px-4 py-2 sm:px-6">
      <h2 class="min-w-0 flex-1 truncate text-base font-semibold text-highlighted capitalize" aria-live="polite">{{ formatMonth(month) }}</h2>
      <UButton size="xs" color="neutral" variant="outline" label="Today" :disabled="month === monthOf(today)" @click="setMonth(monthOf(today))" />
      <UFieldGroup size="xs">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="outline" aria-label="Previous month" @click="setMonth(addMonths(month, -1))" />
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="outline" aria-label="Next month" @click="setMonth(addMonths(month, 1))" />
      </UFieldGroup>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <!-- Month grid (sm and up) -->
      <section class="hidden min-w-0 flex-1 flex-col sm:flex lg:overflow-y-auto" :aria-label="`Calendar, ${formatMonth(month)}`">
        <div class="sticky top-0 z-10 grid grid-cols-7 border-b border-default bg-default/90 backdrop-blur" aria-hidden="true">
          <div v-for="name in weekdays" :key="name" class="px-2 py-1.5 text-xs font-medium text-muted">{{ name }}</div>
        </div>
        <ol class="grid flex-1 auto-rows-[minmax(7rem,1fr)] grid-cols-7">
          <li
            v-for="day in days"
            :key="day"
            :data-day="day"
            :aria-label="dayLabel(day)"
            class="group/day relative flex min-w-0 flex-col gap-1 border-e border-b border-default p-1.5 transition-colors nth-[7n]:border-e-0"
            :class="[
              monthOf(day) !== month && 'bg-elevated/40',
              isWeekend(day) && monthOf(day) === month && 'bg-elevated/20',
              dropTarget === day && 'bg-primary/10 ring-2 ring-primary/50 ring-inset',
            ]"
            @dragover="onDragOver($event, day)"
            @dragleave="onDragLeave($event, day)"
            @drop="onDrop($event, day)"
          >
            <div class="flex items-center justify-between gap-1">
              <span
                class="inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums"
                :class="day === today ? 'bg-primary font-semibold text-inverted' : monthOf(day) === month ? 'text-highlighted' : 'text-dimmed'"
                :aria-current="day === today ? 'date' : undefined"
              >
                {{ Number(day.slice(8)) }}
              </span>
              <UPopover v-if="!readonly" :open="creatingDay === day" :content="{ align: 'end' }" @update:open="(open) => setCreating(day, open)">
                <UButton
                  icon="i-lucide-plus"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="opacity-0 transition group-hover/day:opacity-100 focus-visible:opacity-100"
                  :class="creatingDay === day && 'opacity-100'"
                  :aria-label="`New task due ${dayLabel(day)}`"
                />
                <template #content>
                  <form class="flex w-72 flex-col gap-2 p-2" @submit.prevent="create">
                    <p class="text-xs text-muted">New task due {{ formatCalendarDay(day, { month: 'short', day: 'numeric' }) }}</p>
                    <UInput v-model="newTitle" autofocus size="sm" placeholder="Task title, Enter to add" aria-label="New task title" :loading="saving" />
                  </form>
                </template>
              </UPopover>
            </div>
            <div class="flex min-w-0 flex-col gap-1">
              <ProjectCalendarChip
                v-for="entry in byDay.get(day) ?? []"
                :key="entry.key"
                :task="entry.task"
                :ghost-day="entry.ghostDay"
                :done="isDone(entry.task)"
                :assignee="assigneeOf(entry.task)"
                :draggable="!readonly"
                :class="draggingId === entry.task.id && !entry.ghostDay && 'opacity-40'"
                @open="emit('open', $event)"
                @dragstart="onDragStart"
                @dragend="onDragEnd"
              />
            </div>
          </li>
        </ol>
      </section>

      <!-- Agenda (below sm): only the days of this month that have tasks -->
      <section class="flex flex-col sm:hidden" :aria-label="`Agenda, ${formatMonth(month)}`">
        <p v-if="!agenda.length" class="px-4 py-8 text-center text-sm text-muted">No tasks due this month.</p>
        <div v-for="{ day, entries } in agenda" :key="day" class="border-b border-default px-4 py-2">
          <h3 class="mb-1.5 flex items-center gap-2 text-xs font-medium" :class="day === today ? 'text-primary' : 'text-muted'">
            {{ dayLabel(day) }}
            <UBadge v-if="day === today" label="Today" size="sm" variant="soft" />
          </h3>
          <div class="flex flex-col gap-1">
            <ProjectCalendarChip
              v-for="entry in entries"
              :key="entry.key"
              :task="entry.task"
              :ghost-day="entry.ghostDay"
              :done="isDone(entry.task)"
              :assignee="assigneeOf(entry.task)"
              class="py-1 text-sm"
              @open="emit('open', $event)"
            />
          </div>
        </div>
      </section>

      <!-- Undated tasks: drag onto a day to schedule, or drop a chip here to clear its due date -->
      <aside
        class="shrink-0 border-t border-default lg:w-64 lg:overflow-y-auto lg:border-t-0 lg:border-s"
        :class="dropTarget === 'tray' && 'bg-primary/10 ring-2 ring-primary/50 ring-inset'"
        aria-label="Tasks without a due date"
        data-tray
        @dragover="onDragOver($event, 'tray')"
        @dragleave="onDragLeave($event, 'tray')"
        @drop="onDrop($event, null)"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-highlighted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          :aria-expanded="trayOpen"
          @click="trayOpen = !trayOpen"
        >
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed transition-transform" :class="trayOpen && 'rotate-90'" />
          <UIcon name="i-lucide-calendar-x" class="size-4 shrink-0 text-muted" />
          <span class="flex-1">No due date</span>
          <span class="text-xs text-dimmed tabular-nums">{{ undated.length }}</span>
        </button>
        <div v-if="trayOpen" class="flex flex-col gap-1 px-3 pb-3">
          <p v-if="!readonly" class="hidden px-1 pb-1 text-xs text-dimmed sm:block">Drag a task onto a day to schedule it.</p>
          <p v-if="!undated.length" class="px-1 text-xs text-dimmed">Every task has a due date.</p>
          <ProjectCalendarChip
            v-for="task in undated"
            :key="task.id"
            :task="task"
            :done="isDone(task)"
            :assignee="assigneeOf(task)"
            :draggable="!readonly"
            :class="draggingId === task.id && 'opacity-40'"
            @open="emit('open', $event)"
            @dragstart="onDragStart"
            @dragend="onDragEnd"
          />
        </div>
      </aside>
    </div>
  </div>
</template>
