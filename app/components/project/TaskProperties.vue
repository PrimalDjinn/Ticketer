<script setup lang="ts">
/** Properties sidebar of a task: every change is emitted as a PATCH body; the parent applies it optimistically. */
export type TaskPatch = Partial<
  Pick<TaskDetailDTO, 'title' | 'description' | 'statusId' | 'priority' | 'assigneeId' | 'startDate' | 'dueDate' | 'labelIds' | 'repeat' | 'repeatInterval'>
> & {
  /** Custom field values by field id; `null` clears one. */
  fields?: Record<number, FieldValue | null>
}

const props = defineProps<{
  task: TaskDetailDTO
  statuses: StatusDTO[]
  labels: LabelDTO[]
  members: PublicUser[]
  /** The project's custom fields, in display order. */
  fields?: FieldDTO[]
  readonly?: boolean
  /** Two property pairs per row (slide-over). */
  wide?: boolean
}>()
const emit = defineEmits<{ patch: [body: TaskPatch]; createLabel: [name: string] }>()

const UNASSIGNED = ''
const selectUi = {
  base: 'w-full justify-start px-2 text-sm md:text-sm disabled:opacity-100 disabled:cursor-default',
  trailingIcon: 'hidden',
  content: 'min-w-52',
}

const status = computed(() => props.statuses.find((s) => s.id === props.task.statusId))
const statusItems = computed(() => props.statuses.map((s) => ({ label: s.name, value: s.id, color: s.color, isDone: s.isDone })))
const priorityItems = [...TASK_PRIORITIES].reverse().map((p) => ({ label: priorityMeta[p].label, value: p, icon: priorityMeta[p].icon }))
const assignee = computed(() => props.members.find((m) => m.id === props.task.assigneeId))
const assigneeItems = computed(() => [
  { label: 'Unassigned', value: UNASSIGNED, avatar: undefined },
  ...props.members.map((m) => ({ label: m.name, value: m.id, avatar: { text: initials(m.name) } })),
])
const labelItems = computed(() => props.labels.map((l) => ({ label: l.name, value: l.id, color: l.color })))
const selectedLabels = computed(() => props.task.labelIds.map((id) => props.labels.find((l) => l.id === id)).filter((l): l is LabelDTO => !!l))
const dueTone = computed(() => {
  if (!props.task.dueDate) return 'text-muted'
  const state = dueState(props.task.dueDate, status.value?.isDone)
  return state === 'overdue' ? 'text-error' : state === 'soon' ? 'text-warning' : ''
})

const orderedFields = computed(() => [...(props.fields ?? [])].sort((a, b) => a.position - b.position))

function setDate(field: 'startDate' | 'dueDate', event: Event) {
  const value = (event.target as HTMLInputElement).value || null
  if (value !== props.task[field]) emit('patch', { [field]: value })
}
</script>

<template>
  <dl
    class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 text-sm"
    :class="wide && 'sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem_minmax(0,1fr)] sm:gap-x-3'"
  >
    <dt class="text-muted">Status</dt>
    <dd>
      <USelectMenu
        :model-value="task.statusId"
        :items="statusItems"
        value-key="value"
        :search-input="false"
        variant="ghost"
        size="sm"
        :disabled="readonly"
        :ui="selectUi"
        aria-label="Status"
        @update:model-value="(v) => v !== task.statusId && emit('patch', { statusId: v })"
      >
        <span class="flex min-w-0 items-center gap-2">
          <span class="size-2 shrink-0 rounded-full" :class="color(status?.color).dot" />
          <span class="truncate">{{ status?.name ?? 'Unknown' }}</span>
        </span>
        <template #item-leading="{ item }">
          <span class="ms-0.5 size-2 shrink-0 rounded-full" :class="color(item.color).dot" />
        </template>
      </USelectMenu>
    </dd>

    <dt class="text-muted">Priority</dt>
    <dd>
      <USelectMenu
        :model-value="task.priority"
        :items="priorityItems"
        value-key="value"
        :search-input="false"
        variant="ghost"
        size="sm"
        :disabled="readonly"
        :ui="selectUi"
        aria-label="Priority"
        @update:model-value="(v) => v !== task.priority && emit('patch', { priority: v })"
      >
        <span class="flex min-w-0 items-center gap-2">
          <UIcon :name="priorityMeta[task.priority].icon" class="size-4 shrink-0" :class="priorityMeta[task.priority].class" />
          <span class="truncate" :class="task.priority === 'none' && 'text-muted'">{{ priorityMeta[task.priority].label }}</span>
        </span>
      </USelectMenu>
    </dd>

    <dt class="text-muted">Assignee</dt>
    <dd>
      <USelectMenu
        :model-value="task.assigneeId ?? UNASSIGNED"
        :items="assigneeItems"
        value-key="value"
        variant="ghost"
        size="sm"
        :disabled="readonly"
        :ui="selectUi"
        :search-input="{ placeholder: 'Assign to…' }"
        aria-label="Assignee"
        @update:model-value="(v) => (v || null) !== task.assigneeId && emit('patch', { assigneeId: v || null })"
      >
        <span class="flex min-w-0 items-center gap-2">
          <UAvatar v-if="assignee" :text="initials(assignee.name)" size="3xs" />
          <UIcon v-else name="i-lucide-circle-user-round" class="size-4 shrink-0 text-dimmed" />
          <span class="truncate" :class="!assignee && 'text-muted'">{{ assignee?.name ?? 'Unassigned' }}</span>
        </span>
      </USelectMenu>
    </dd>

    <dt class="text-muted">Labels</dt>
    <dd>
      <USelectMenu
        :model-value="task.labelIds"
        :items="labelItems"
        value-key="value"
        multiple
        variant="ghost"
        size="sm"
        :disabled="readonly"
        :create-item="!readonly"
        :ui="{ ...selectUi, base: `${selectUi.base} h-auto min-h-7 py-1` }"
        :search-input="{ placeholder: 'Find or create a label…' }"
        aria-label="Labels"
        @update:model-value="(v) => emit('patch', { labelIds: v })"
        @create="(name) => emit('createLabel', name)"
      >
        <span v-if="selectedLabels.length" class="flex flex-wrap gap-1">
          <span
            v-for="label in selectedLabels"
            :key="label.id"
            class="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-xs ring ring-inset ring-default"
          >
            <span class="size-1.5 rounded-full" :class="color(label.color).dot" />
            {{ label.name }}
          </span>
        </span>
        <span v-else class="text-muted">{{ readonly ? 'None' : 'Add labels' }}</span>
        <template #item-leading="{ item }">
          <span class="ms-0.5 size-2 shrink-0 rounded-full" :class="color(item.color).dot" />
        </template>
      </USelectMenu>
    </dd>

    <dt class="text-muted">Start date</dt>
    <dd>
      <UInput
        type="date"
        :model-value="task.startDate ?? ''"
        variant="ghost"
        size="sm"
        :disabled="readonly"
        :max="task.dueDate ?? undefined"
        class="w-full"
        :ui="{ base: ['text-sm md:text-sm disabled:opacity-100 disabled:cursor-default', !task.startDate && 'text-muted'], root: 'w-full' }"
        aria-label="Start date"
        @change="setDate('startDate', $event)"
      />
    </dd>

    <dt class="text-muted">Due date</dt>
    <dd>
      <UInput
        type="date"
        :model-value="task.dueDate ?? ''"
        variant="ghost"
        size="sm"
        :disabled="readonly"
        :min="task.startDate ?? undefined"
        class="w-full"
        :ui="{
          base: ['text-sm md:text-sm disabled:opacity-100 disabled:cursor-default', dueTone],
          root: 'w-full',
        }"
        aria-label="Due date"
        @change="setDate('dueDate', $event)"
      />
    </dd>

    <dt class="flex items-center gap-1 self-start pt-1 text-muted">Repeat</dt>
    <dd>
      <ProjectRepeatPicker
        :repeat="task.repeat"
        :interval="task.repeatInterval"
        :disabled="readonly"
        inline
        @change="(v) => emit('patch', v)"
      />
    </dd>

    <template v-for="field in orderedFields" :key="field.id">
      <dt class="flex min-w-0 items-center gap-1 text-muted" :class="field.type === 'multiselect' && 'self-start pt-1'">
        <span class="truncate" :title="field.name">{{ field.name }}</span>
        <template v-if="field.required">
          <span class="text-error" aria-hidden="true">*</span>
          <span class="sr-only">(required)</span>
        </template>
      </dt>
      <dd class="min-w-0">
        <ProjectFieldInput
          :field="field"
          :value="task.fieldValues[field.id]"
          :disabled="readonly"
          inline
          @commit="(v) => emit('patch', { fields: { [field.id]: v } })"
        />
      </dd>
    </template>
  </dl>
</template>
