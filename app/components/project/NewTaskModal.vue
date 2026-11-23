<script setup lang="ts">
const props = defineProps<{
  projectKey: string
  statuses: StatusDTO[]
  members: PublicUser[]
  labels: LabelDTO[]
  /** The project's custom fields; fetched with the project when not passed. */
  fields?: FieldDTO[]
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
  repeat: null as TaskRepeat | null,
  repeatInterval: null as number | null,
  fields: {} as Record<number, FieldValue>,
})
const form = reactive(blank())
const createMore = ref(false)
const saving = ref(false)
const titleInput = useTemplateRef<{ inputRef: HTMLInputElement | null }>('titleInput')
/** Server-side validation message (e.g. "Fill in Environment"), shown above the custom fields. */
const fieldError = ref('')
const attempted = ref(false)

// Custom fields: from the prop when the page passes them, otherwise read with the project when the dialog opens.
const loadedFields = ref<FieldDTO[] | null>(null)
const projectFields = computed(() => [...(props.fields ?? loadedFields.value ?? [])].sort((a, b) => a.position - b.position))
async function loadFields() {
  if (props.fields) return
  try {
    loadedFields.value = (await $fetch<ProjectBoardDTO>(`/api/projects/${props.projectKey}`)).project.fields
  } catch {
    // The server still enforces required fields; the error is surfaced on submit.
  }
}
onRealtime('project.updated', (project) => {
  if (!props.fields && project.key === props.projectKey) loadedFields.value = project.fields
})
const missingRequired = (field: FieldDTO) => field.required && isEmptyFieldValue(form.fields[field.id])
function setField(field: FieldDTO, value: FieldValue | null) {
  const next = { ...form.fields }
  if (value === null) delete next[field.id]
  else next[field.id] = value
  form.fields = next
  if (fieldError.value && !projectFields.value.some(missingRequired)) fieldError.value = ''
}

// Fresh form each time the modal opens (keeps the column it was opened from).
watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(form, blank())
  fieldError.value = ''
  attempted.value = false
  loadFields()
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
  attempted.value = true
  fieldError.value = ''
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
        repeat: form.repeat,
        repeatInterval: form.repeat === 'periodically' ? form.repeatInterval : null,
        fields: form.fields,
        requireFields: true,
      },
    })
    emit('created', task)
    toast.add({ title: `${task.ref} created`, description: task.title, icon: 'i-lucide-circle-check', color: 'success' })
    if (createMore.value) {
      // Keep the picked status/assignee/labels for a run of similar tasks; clear the text.
      form.title = ''
      form.description = ''
      attempted.value = false
      await nextTick()
      titleInput.value?.inputRef?.focus()
    } else {
      open.value = false
    }
  } catch (e) {
    const message = errorMessage(e)
    // Validation of custom fields is shown next to them; anything else goes to a toast.
    if (projectFields.value.length && /^(Fill in|.*\bfield\b)/i.test(message)) fieldError.value = message
    else toast.add({ title: message, color: 'error' })
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

          <ProjectRepeatPicker
            :repeat="form.repeat"
            :interval="form.repeatInterval"
            variant="soft"
            @change="(v) => ((form.repeat = v.repeat), (form.repeatInterval = v.repeatInterval))"
          />
        </div>
        <p v-if="form.repeat" class="text-xs text-dimmed">{{ REPEAT_HINT }}.</p>

        <fieldset v-if="projectFields.length" class="space-y-2 border-t border-default pt-3">
          <legend class="sr-only">Custom fields</legend>
          <UAlert v-if="fieldError" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="fieldError" :ui="{ root: 'py-2', title: 'text-sm' }" role="alert" />
          <div class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
            <template v-for="field in projectFields" :key="field.id">
              <span class="flex min-w-0 items-center gap-1 text-muted" :class="field.type === 'multiselect' && 'self-start pt-1'">
                <UIcon :name="fieldTypeMeta[field.type].icon" class="size-3.5 shrink-0 text-dimmed" />
                <span class="truncate" :title="field.name">{{ field.name }}</span>
                <template v-if="field.required">
                  <span class="text-error" aria-hidden="true">*</span>
                  <span class="sr-only">(required)</span>
                </template>
              </span>
              <ProjectFieldInput
                :field="field"
                :value="form.fields[field.id]"
                variant="outline"
                live
                :invalid="attempted && !!fieldError && missingRequired(field)"
                @commit="(v) => setField(field, v)"
              />
            </template>
          </div>
        </fieldset>
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
