<script setup lang="ts">
const props = defineProps<{
  projectKey: string
  statuses: StatusDTO[]
  members: PublicUser[]
  labels: LabelDTO[]
  defaultStatusId?: number | null
}>()
const emit = defineEmits<{ created: [task: TaskDTO] }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()

const orderedStatuses = computed(() => [...props.statuses].sort((a, b) => a.position - b.position))

const blank = () => ({
  title: '',
  description: '',
  statusId: props.defaultStatusId ?? orderedStatuses.value[0]?.id,
  priority: 'none' as TaskPriority,
  assigneeId: '', // '' = unassigned (select menus handle empty strings better than null)
  dueDate: '',
  labelIds: [] as number[],
})
const form = reactive(blank())
const createMore = ref(false)
const saving = ref(false)
const titleInput = useTemplateRef<{ inputRef: HTMLInputElement | null }>('titleInput')

// Fresh form each time the modal opens (keeps the column it was opened from).
watch(open, (isOpen) => {
  if (isOpen) Object.assign(form, blank())
})

const statusItems = computed(() =>
  orderedStatuses.value.map((s) => ({ label: s.name, value: s.id, chip: { ui: { base: color(s.color).dot } } })),
)
const priorityItems = [...TASK_PRIORITIES].reverse().map((p) => ({
  label: priorityMeta[p].label,
  value: p,
  icon: priorityMeta[p].icon,
  ui: { itemLeadingIcon: priorityMeta[p].class },
}))
const assigneeItems = computed(() => [
  { label: 'Unassigned', value: '', icon: 'i-lucide-circle-user' },
  ...props.members.map((m) => ({ label: m.name, value: m.id, avatar: { alt: m.name } })),
])
const labelItems = computed(() => props.labels.map((l) => ({ label: l.name, value: l.id, chip: { ui: { base: color(l.color).dot } } })))

const currentStatus = computed(() => props.statuses.find((s) => s.id === form.statusId))
const currentAssignee = computed(() => props.members.find((m) => m.id === form.assigneeId))

async function submit() {
  const title = form.title.trim()
  if (!title || saving.value) return
  saving.value = true
  try {
    const task = await $fetch<TaskDTO>(`/api/projects/${props.projectKey}/tasks`, {
      method: 'POST',
      body: {
        title,
        description: form.description.trim() || undefined,
        statusId: form.statusId,
        priority: form.priority,
        assigneeId: form.assigneeId || null,
        dueDate: form.dueDate || null,
        labelIds: form.labelIds,
      },
    })
    emit('created', task)
    toast.add({ title: `${task.ref} created`, description: task.title, icon: 'i-lucide-circle-check', color: 'success' })
    if (createMore.value) {
      // Keep the picked status/assignee/labels for a run of similar tasks; clear the text.
      form.title = ''
      form.description = ''
      await nextTick()
      titleInput.value?.inputRef?.focus()
    } else {
      open.value = false
    }
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="New task" :ui="{ content: 'sm:max-w-xl', body: 'space-y-3', footer: 'justify-between gap-3' }">
    <template #body>
      <form id="new-task-form" class="space-y-3" @submit.prevent="submit" @keydown.meta.enter.prevent="submit" @keydown.ctrl.enter.prevent="submit">
        <UInput
          ref="titleInput"
          v-model="form.title"
          autofocus
          required
          maxlength="300"
          placeholder="Task title"
          aria-label="Title"
          variant="none"
          size="xl"
          class="w-full"
          :ui="{ base: 'px-0 font-medium' }"
        />
        <UTextarea
          v-model="form.description"
          placeholder="Add a description…"
          aria-label="Description"
          variant="none"
          autoresize
          :rows="3"
          :maxrows="12"
          class="w-full"
          :ui="{ base: 'px-0' }"
        />

        <div class="flex flex-wrap gap-2">
          <USelectMenu
            v-model="form.statusId"
            :items="statusItems"
            value-key="value"
            :search-input="false"
            size="sm"
            variant="soft"
            aria-label="Status"
          >
            <template #leading>
              <span class="size-2 rounded-full" :class="color(currentStatus?.color).dot" />
            </template>
          </USelectMenu>

          <USelectMenu
            v-model="form.priority"
            :items="priorityItems"
            value-key="value"
            :search-input="false"
            :icon="priorityMeta[form.priority].icon"
            size="sm"
            variant="soft"
            aria-label="Priority"
          />

          <USelectMenu
            v-model="form.assigneeId"
            :items="assigneeItems"
            value-key="value"
            size="sm"
            variant="soft"
            aria-label="Assignee"
            :search-input="{ placeholder: 'Assign to…' }"
          >
            <template #leading>
              <UAvatar v-if="currentAssignee" :alt="currentAssignee.name" size="3xs" />
              <UIcon v-else name="i-lucide-circle-user" class="size-4 text-muted" />
            </template>
          </USelectMenu>

          <UInput v-model="form.dueDate" type="date" size="sm" variant="soft" icon="i-lucide-calendar" aria-label="Due date" />

          <USelectMenu
            v-if="labels.length"
            v-model="form.labelIds"
            :items="labelItems"
            value-key="value"
            multiple
            size="sm"
            variant="soft"
            icon="i-lucide-tag"
            placeholder="Labels"
            aria-label="Labels"
            :search-input="{ placeholder: 'Filter labels…' }"
          />
        </div>
      </form>
    </template>

    <template #footer>
      <USwitch v-model="createMore" label="Create more" size="sm" />
      <div class="flex items-center gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton type="submit" form="new-task-form" label="Create task" :loading="saving" :disabled="!form.title.trim()">
          <template #trailing>
            <UKbd value="enter" size="sm" class="hidden sm:inline-flex" />
          </template>
        </UButton>
      </div>
    </template>
  </UModal>
</template>
