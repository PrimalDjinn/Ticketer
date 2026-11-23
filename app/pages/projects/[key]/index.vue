<script setup lang="ts">
import { z } from 'zod'
import type { TaskMove } from '~/composables/taskDragDrop'
import type { TaskDates } from '~/utils/dates'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user } = useUserSession()

const key = computed(() => String(route.params.key ?? ''))
const readonly = computed(() => user.value?.role === 'viewer')

const { data: board, error, refresh } = await useFetch<ProjectBoardDTO>(() => `/api/projects/${key.value}`, {
  deep: true, // tasks are patched in place by drag and drop and realtime updates
})

useSeoMeta({ title: () => `${board.value?.project.name ?? 'Project'} · Ticketer` })

// --- URL state: view and open task -----------------------------------------------------------------------------------
const viewQuery = z.enum(['board', 'list', 'calendar', 'gantt']).catch('board')
type View = z.output<typeof viewQuery>
const view = computed<View>({
  get: () => viewQuery.parse(route.query.view),
  set: (value) => router.replace({ query: { ...route.query, view: value === 'board' ? undefined : value } }),
})
const viewItems = [
  { label: 'Board', value: 'board', icon: 'i-lucide-kanban' },
  { label: 'List', value: 'list', icon: 'i-lucide-list' },
  { label: 'Calendar', value: 'calendar', icon: 'i-lucide-calendar' },
  { label: 'Gantt', value: 'gantt', icon: 'i-lucide-gantt-chart' },
]

const taskQuery = z.coerce.number().int().positive().nullable().catch(null)
const openTaskId = computed(() => taskQuery.parse(route.query.task ?? null))

function openTask(task: TaskDTO) {
  router.replace({ query: { ...route.query, task: String(task.id) } })
}
function close() {
  const { task: _task, ...query } = route.query
  router.replace({ query })
}

// --- Filters ---------------------------------------------------------------------------------------------------------
const { matches } = useTaskFilters()
const statuses = computed(() => [...(board.value?.project.statuses ?? [])].sort((a, b) => a.position - b.position))
const visibleTasks = computed(() => (board.value?.tasks ?? []).filter((t) => t.parentId === null && matches(t)))

// --- Mutations -------------------------------------------------------------------------------------------------------
function upsert(task: TaskDTO) {
  if (!board.value) return
  const index = board.value.tasks.findIndex((t) => t.id === task.id)
  if (index === -1) board.value.tasks.push(task)
  else board.value.tasks.splice(index, 1, task)
}

async function moveTask({ taskId, statusId, prevId, nextId }: TaskMove) {
  if (!board.value) return
  const task = board.value.tasks.find((t) => t.id === taskId)
  if (!task) return
  // Neighbours come from what was visible; the position is computed in the full column (hidden, filtered-out tasks
  // included), so the task lands directly after its visible predecessor — or directly before its visible successor
  // when dropped first — and never jumps over tasks the filter hid.
  const column = board.value.tasks
    .filter((t) => t.statusId === statusId && t.parentId === null && t.id !== taskId)
    .sort((a, b) => a.position - b.position || a.id - b.id)
  const prevIndex = prevId === null ? -1 : column.findIndex((t) => t.id === prevId)
  const nextIndex = nextId === null ? -1 : column.findIndex((t) => t.id === nextId)
  let position: number
  if (prevIndex !== -1) position = positionBetween(column[prevIndex]!.position, column[prevIndex + 1]?.position)
  else if (nextIndex !== -1) position = positionBetween(column[nextIndex - 1]?.position, column[nextIndex]!.position)
  else position = positionBetween(column.at(-1)?.position) // empty column or a status change from the list menu: last

  const before = { statusId: task.statusId, position: task.position }
  Object.assign(task, { statusId, position })
  try {
    upsert(await $fetch<TaskDTO>(`/api/tasks/${taskId}`, { method: 'PATCH', body: { statusId, position } }))
  } catch (e) {
    Object.assign(task, before)
    toast.add({ title: 'Could not move the task', description: errorMessage(e), color: 'error' })
  }
}

/** Calendar and Gantt rescheduling: optimistic, rolled back with a toast when the server refuses. */
async function rescheduleTask(task: TaskDTO, dates: TaskDates) {
  const current = board.value?.tasks.find((t) => t.id === task.id)
  if (!current) return
  const before: TaskDates = { startDate: current.startDate, dueDate: current.dueDate }
  Object.assign(current, dates)
  try {
    upsert(await $fetch<TaskDTO>(`/api/tasks/${task.id}`, { method: 'PATCH', body: dates }))
  } catch (e) {
    Object.assign(current, before)
    toast.add({ title: 'Could not reschedule the task', description: errorMessage(e), color: 'error' })
  }
}

// --- Realtime --------------------------------------------------------------------------------------------------------
const draggingId = ref<number | null>(null)
const isThisProject = (projectId: number) => board.value?.project.id === projectId

function onTaskChange(task: TaskDTO) {
  if (!isThisProject(task.projectId) || task.id === draggingId.value) return
  upsert(task)
}
onRealtime('task.created', onTaskChange)
onRealtime('task.updated', onTaskChange)
onRealtime('task.deleted', ({ id, projectId }) => {
  if (!board.value || !isThisProject(projectId)) return
  board.value.tasks = board.value.tasks.filter((t) => t.id !== id)
})
onRealtime('project.updated', (project) => {
  if (!board.value || !isThisProject(project.id)) return
  const ids = (p: ProjectDTO) => p.statuses.map((s) => s.id).sort().join()
  const statusesChanged = ids(project) !== ids(board.value.project)
  board.value.project = project
  // Tasks of a removed status were moved by the server; fetch them again.
  if (statusesChanged) refresh()
})
onRealtime('project.deleted', ({ id }) => {
  if (!isThisProject(id)) return
  toast.add({ title: 'This project was deleted', color: 'warning' })
  navigateTo('/')
})
onRealtime('labels.updated', (labels) => {
  if (board.value) board.value.labels = labels
})
onRealtimeResync(() => refresh())

// --- New task and settings -------------------------------------------------------------------------------------------
const newTaskOpen = ref(false)
const settingsOpen = ref(false)
const filterBar = useTemplateRef<{ focus: () => void }>('filterBar')

function newTask() {
  if (!readonly.value && board.value) newTaskOpen.value = true
}

defineShortcuts({
  c: newTask,
  meta_b: () => (view.value = view.value === 'board' ? 'list' : 'board'),
  '/': () => filterBar.value?.focus(),
})
</script>

<template>
  <UDashboardPanel id="project" :ui="{ body: 'p-0 sm:p-0 gap-0 sm:gap-0 overflow-hidden' }">
    <template #header>
      <AppNavbar :title="board?.project.name ?? 'Project'">
        <template #right>
          <UTabs
            v-if="board"
            v-model="view"
            :items="viewItems"
            :content="false"
            size="xs"
            variant="pill"
            color="neutral"
            aria-label="View"
            :ui="{ label: 'hidden sm:inline' }"
          />
          <UTooltip v-if="board && !readonly" text="Project settings">
            <UButton icon="i-lucide-settings-2" color="neutral" variant="ghost" aria-label="Project settings" @click="settingsOpen = true" />
          </UTooltip>
          <UTooltip v-if="board && !readonly" text="New task" :kbds="['c']">
            <UButton icon="i-lucide-plus" aria-label="New task" @click="newTask">
              <span class="hidden sm:inline">New task</span>
            </UButton>
          </UTooltip>
        </template>
      </AppNavbar>
      <UDashboardToolbar v-if="board">
        <template #left>
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <span class="size-2.5 shrink-0 rounded-full" :class="color(board.project.color).dot" aria-hidden="true" />
            <span class="me-1 hidden font-mono text-xs text-muted sm:inline">{{ board.project.key }}</span>
            <ProjectFilterBar ref="filterBar" :members="board.members" :labels="board.labels" :count="visibleTasks.length" />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="error || !board" class="flex flex-1 items-center justify-center p-6">
        <UEmpty
          icon="i-lucide-folder-x"
          :title="error?.statusCode === 404 ? 'Project not found' : 'Could not load the project'"
          :description="error?.statusCode === 404 ? 'It may have been deleted, or the link is wrong.' : errorMessage(error)"
          :actions="[{ label: 'Try again', icon: 'i-lucide-rotate-cw', color: 'neutral', variant: 'subtle', onClick: () => refresh() }]"
        />
      </div>

      <template v-else>
        <div v-if="!statuses.length" class="flex flex-1 items-center justify-center p-6">
          <UEmpty icon="i-lucide-columns-3" title="No workflow yet" description="Add statuses in the project settings to start tracking tasks." />
        </div>
        <ProjectBoard
          v-else-if="view === 'board'"
          :project-key="board.project.key"
          :statuses="statuses"
          :tasks="visibleTasks"
          :labels="board.labels"
          :members="board.members"
          :readonly="readonly"
          @open="openTask"
          @move="moveTask"
          @created="upsert"
          @drag="(id) => (draggingId = id)"
        />
        <ProjectList
          v-else-if="view === 'list'"
          :project-key="board.project.key"
          :statuses="statuses"
          :tasks="visibleTasks"
          :labels="board.labels"
          :members="board.members"
          :readonly="readonly"
          @open="openTask"
          @move="moveTask"
          @created="upsert"
        />
        <ProjectCalendar
          v-else-if="view === 'calendar'"
          :project-key="board.project.key"
          :statuses="statuses"
          :tasks="visibleTasks"
          :members="board.members"
          :readonly="readonly"
          @open="openTask"
          @reschedule="rescheduleTask"
          @created="upsert"
        />
        <ProjectGantt
          v-else
          :statuses="statuses"
          :tasks="visibleTasks"
          :members="board.members"
          :readonly="readonly"
          @open="openTask"
          @reschedule="rescheduleTask"
        />

        <ProjectNewTaskModal
          v-if="!readonly"
          v-model:open="newTaskOpen"
          :project-key="board.project.key"
          :fields="board.project.fields"
          :statuses="statuses"
          :members="board.members"
          :labels="board.labels"
          @created="upsert"
        />
        <ProjectSettingsModal v-if="board" v-model:open="settingsOpen" :project="board.project" :labels="board.labels" @updated="refresh()" />
        <ProjectTaskPanel :task-id="openTaskId" :project-key="key" @close="close" />
      </template>
    </template>
  </UDashboardPanel>
</template>
