<script setup lang="ts">
import type { TaskMove } from '~/composables/taskDragDrop'
const props = defineProps<{
  projectKey: string
  statuses: StatusDTO[]
  tasks: TaskDTO[]
  labels: LabelDTO[]
  members: PublicUser[]
  readonly?: boolean
}>()
const emit = defineEmits<{
  open: [task: TaskDTO]
  move: [move: TaskMove]
  created: [task: TaskDTO]
  /** Id of the task being dragged, or null when the drag ends. */
  drag: [taskId: number | null]
}>()

const columns = computed(() =>
  [...props.statuses]
    .sort((a, b) => a.position - b.position)
    .map((status) => ({
      status,
      tasks: props.tasks.filter((t) => t.statusId === status.id).sort((a, b) => a.position - b.position || a.id - b.id),
    })),
)

const adding = ref<number | null>(null)

// --- Drag and drop -------------------------------------------------------------------------------------------------
const { setContainer, justDropped } = useTaskDragDrop({
  group: 'board',
  disabled: () => !!props.readonly,
  classes: { ghost: 'board-ghost', chosen: 'board-chosen', drag: 'board-drag' },
  onMove: (move) => emit('move', move),
  onDrag: (taskId) => emit('drag', taskId),
})

function open(task: TaskDTO) {
  // A drop can be followed by a stray click on the card underneath the pointer.
  if (justDropped()) return
  emit('open', task)
}

function created(task: TaskDTO) {
  emit('created', task)
}
</script>

<template>
  <div class="flex min-h-0 flex-1 snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto overscroll-x-contain p-3 sm:snap-none sm:p-4">
    <section
      v-for="{ status, tasks: columnTasks } in columns"
      :key="status.id"
      class="flex max-h-full w-[min(85vw,20rem)] shrink-0 snap-start flex-col rounded-lg sm:w-72"
      :class="status.isDone ? 'bg-elevated/30' : 'bg-elevated/60'"
      :aria-label="status.name"
    >
      <header class="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <span class="size-2 shrink-0 rounded-full" :class="color(status.color).dot" />
        <h2 class="truncate text-sm font-medium" :class="status.isDone ? 'text-muted' : 'text-highlighted'">{{ status.name }}</h2>
        <span class="text-xs text-dimmed tabular-nums">{{ columnTasks.length }}</span>
        <UTooltip v-if="!readonly" :text="`Add task to ${status.name}`">
          <UButton
            icon="i-lucide-plus"
            size="xs"
            color="neutral"
            variant="ghost"
            class="ms-auto"
            :aria-label="`Add task to ${status.name}`"
            @click="adding = status.id"
          />
        </UTooltip>
      </header>

      <div
        :ref="(el) => setContainer(status.id, el)"
        :data-status-id="status.id"
        class="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2"
        :class="status.isDone && 'opacity-80'"
      >
        <ProjectTaskCard
          v-for="task in columnTasks"
          :key="task.id"
          :task="task"
          :labels="labels"
          :members="members"
          :done="status.isDone"
          :class="!readonly && 'cursor-grab active:cursor-grabbing'"
          @open="open"
        />
      </div>

      <div v-if="!readonly" class="px-2 pb-2">
        <ProjectQuickAdd v-if="adding === status.id" :project-key="projectKey" :status-id="status.id" @created="created" @cancel="adding = null" />
        <UButton v-else icon="i-lucide-plus" label="Add task" size="xs" color="neutral" variant="ghost" block class="justify-start text-muted" @click="adding = status.id" />
      </div>
    </section>
  </div>
</template>

<style>
/* Applied by Sortable at runtime; global because the drag preview is appended to <body>. */
.board-ghost {
  opacity: 0.35;
  border-style: dashed;
}
.board-drag {
  transform: rotate(2deg);
  box-shadow: 0 10px 24px -6px rgb(0 0 0 / 0.25);
  opacity: 1 !important;
}
</style>
