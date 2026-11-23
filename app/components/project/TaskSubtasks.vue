<script setup lang="ts">
/** Subtask checklist: toggling moves a subtask between the first open column and the first done column. */
const props = defineProps<{
  task: TaskDetailDTO
  statuses: StatusDTO[]
  members: PublicUser[]
  readonly?: boolean
  /** Open subtasks in place (emits `open`) instead of following the link. */
  inPlace?: boolean
}>()
const emit = defineEmits<{ upsert: [task: TaskDTO]; open: [id: number] }>()

const toast = useToast()
const statusById = computed(() => new Map(props.statuses.map((s) => [s.id, s])))
const firstOpen = computed(() => props.statuses.find((s) => !s.isDone))
const firstDone = computed(() => props.statuses.find((s) => s.isDone))
const isDone = (t: TaskDTO) => statusById.value.get(t.statusId)?.isDone ?? false
const doneCount = computed(() => props.task.subtasks.filter(isDone).length)
const total = computed(() => props.task.subtasks.length)
const memberName = (id: string | null) => props.members.find((m) => m.id === id)?.name

const link = (t: TaskDTO) => `/projects/${props.task.project.key}/${t.number}`

function open(event: MouseEvent, t: TaskDTO) {
  if (!props.inPlace || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  emit('open', t.id)
}

async function toggle(t: TaskDTO) {
  const target = isDone(t) ? firstOpen.value : firstDone.value
  if (!target) {
    toast.add({ color: 'warning', title: isDone(t) ? 'This project has no open column' : 'Mark a column as "Done" in the project settings first' })
    return
  }
  const before = { ...t }
  emit('upsert', { ...t, statusId: target.id })
  try {
    emit('upsert', await $fetch<TaskDTO>(`/api/tasks/${t.id}`, { method: 'PATCH', body: { statusId: target.id } }))
  } catch (e) {
    emit('upsert', before)
    toast.add({ color: 'error', title: errorMessage(e, 'Could not update the subtask') })
  }
}

const adding = ref(false)
const title = ref('')
const saving = ref(false)
async function add() {
  const value = title.value.trim()
  if (!value || saving.value) return
  saving.value = true
  try {
    const created = await $fetch<TaskDTO>(`/api/projects/${props.task.project.key}/tasks`, { method: 'POST', body: { title: value, parentId: props.task.id } })
    emit('upsert', created)
    title.value = ''
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not add the subtask') })
  } finally {
    saving.value = false
  }
}

function cancel() {
  title.value = ''
  adding.value = false
}
</script>

<template>
  <section class="space-y-2" aria-labelledby="subtasks-heading">
    <div class="flex items-center gap-3">
      <h2 id="subtasks-heading" class="text-sm font-semibold text-highlighted">Subtasks</h2>
      <template v-if="total">
        <span class="text-xs text-muted tabular-nums">{{ doneCount }}/{{ total }}</span>
        <UProgress :model-value="doneCount" :max="total" size="xs" color="success" class="max-w-32" :aria-label="`${doneCount} of ${total} subtasks done`" />
      </template>
      <UButton
        v-if="!readonly && !adding"
        icon="i-lucide-plus"
        size="xs"
        color="neutral"
        variant="ghost"
        label="Add"
        class="ms-auto"
        @click="adding = true"
      />
    </div>

    <ul v-if="total" class="divide-y divide-default overflow-hidden rounded-lg ring ring-default">
      <li v-for="sub in task.subtasks" :key="sub.id" class="group flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-elevated/50">
        <button
          type="button"
          class="grid size-4 shrink-0 place-items-center rounded-full ring ring-inset transition focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
          :class="isDone(sub) ? 'bg-success text-inverted ring-success' : 'ring-accented hover:ring-success'"
          :disabled="readonly"
          :aria-pressed="isDone(sub)"
          :aria-label="isDone(sub) ? `Reopen ${sub.ref}` : `Complete ${sub.ref}`"
          @click="toggle(sub)"
        >
          <UIcon v-if="isDone(sub)" name="i-lucide-check" class="size-3" />
        </button>
        <span class="shrink-0 font-mono text-xs text-muted">{{ sub.ref }}</span>
        <NuxtLink
          :to="link(sub)"
          class="min-w-0 flex-1 truncate rounded hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          :class="isDone(sub) ? 'text-muted line-through' : 'text-highlighted'"
          @click.capture="open($event, sub)"
        >
          {{ sub.title }}
        </NuxtLink>
        <span class="hidden shrink-0 items-center gap-1 text-xs text-muted sm:flex">
          <span class="size-1.5 rounded-full" :class="color(statusById.get(sub.statusId)?.color).dot" />
          {{ statusById.get(sub.statusId)?.name }}
        </span>
        <UTooltip v-if="sub.assigneeId" :text="memberName(sub.assigneeId) ?? 'Assigned'">
          <UAvatar :text="initials(memberName(sub.assigneeId) ?? '?')" size="3xs" />
        </UTooltip>
      </li>
    </ul>
    <p v-else-if="readonly || !adding" class="text-sm text-muted">No subtasks.</p>

    <form v-if="adding" class="flex items-center gap-2" @submit.prevent="add">
      <UInput
        v-model="title"
        placeholder="Subtask title"
        size="sm"
        class="flex-1"
        autofocus
        :disabled="saving"
        aria-label="New subtask title"
        @keydown.esc.stop.prevent="cancel"
      />
      <UButton type="submit" size="sm" label="Add" :loading="saving" :disabled="!title.trim()" />
      <UButton size="sm" color="neutral" variant="ghost" label="Done" @click="cancel" />
    </form>
  </section>
</template>
