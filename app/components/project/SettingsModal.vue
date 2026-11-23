<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { useSortable } from '@vueuse/integrations/useSortable'

/** Project settings: general details, the workflow columns and the workspace labels. */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ project: ProjectDTO; labels: LabelDTO[] }>()
const emit = defineEmits<{ updated: [project: ProjectDTO]; 'update:labels': [labels: LabelDTO[]] }>()

const { user } = useUserSession()
const toast = useToast()
const isAdmin = computed(() => user.value?.role === 'admin')

const tab = ref<'general' | 'workflow' | 'labels'>('general')
const tabs: TabsItem[] = [
  { label: 'General', value: 'general', icon: 'i-lucide-settings-2' },
  { label: 'Workflow', value: 'workflow', icon: 'i-lucide-columns-3' },
  { label: 'Labels', value: 'labels', icon: 'i-lucide-tags' },
]

// --- general ------------------------------------------------------------------------------------------------------
const general = reactive({ name: '', description: '', color: 'neutral' })
const savingGeneral = ref(false)
const generalDirty = computed(
  () => general.name.trim() !== props.project.name || general.description.trim() !== props.project.description || general.color !== props.project.color,
)

async function saveGeneral() {
  if (!general.name.trim()) return
  savingGeneral.value = true
  try {
    const updated = await $fetch<ProjectDTO>(`/api/projects/${props.project.key}`, {
      method: 'PATCH',
      body: { name: general.name.trim(), description: general.description.trim(), color: general.color },
    })
    emit('updated', updated)
    toast.add({ title: 'Project updated', color: 'success' })
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not save the project') })
  } finally {
    savingGeneral.value = false
  }
}

const archiving = ref(false)
async function toggleArchived() {
  archiving.value = true
  const archived = !props.project.archivedAt
  try {
    const updated = await $fetch<ProjectDTO>(`/api/projects/${props.project.key}`, { method: 'PATCH', body: { archived } })
    emit('updated', updated)
    toast.add({ title: archived ? 'Project archived' : 'Project restored', color: 'success' })
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e) })
  } finally {
    archiving.value = false
  }
}

const deleteConfirm = ref('')
const deleting = ref(false)
async function deleteProject() {
  if (deleteConfirm.value.trim().toUpperCase() !== props.project.key) return
  deleting.value = true
  try {
    await $fetch(`/api/projects/${props.project.key}`, { method: 'DELETE' })
    open.value = false
    toast.add({ title: `${props.project.name} deleted`, color: 'success' })
    await navigateTo('/projects')
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not delete the project') })
  } finally {
    deleting.value = false
  }
}

// --- workflow -----------------------------------------------------------------------------------------------------
interface Column {
  uid: string
  id?: number
  name: string
  color: string
  isDone: boolean
}
let uidCounter = 0
const columns = ref<Column[]>([])
const columnList = useTemplateRef<HTMLElement>('columnList')
useSortable(columnList, columns, { handle: '[data-drag-handle]', animation: 150, watchElement: true })

const originalColumns = computed(() => [...props.project.statuses].sort((a, b) => a.position - b.position))
const workflowDirty = computed(() => {
  const now = columns.value.map((c) => [c.id ?? null, c.name.trim(), c.color, c.isDone])
  const was = originalColumns.value.map((s) => [s.id, s.name, s.color, s.isDone])
  return JSON.stringify(now) !== JSON.stringify(was)
})
const removedWithTasks = computed(() => originalColumns.value.filter((s) => !columns.value.some((c) => c.id === s.id)))
const workflowValid = computed(() => columns.value.length > 0 && columns.value.every((c) => c.name.trim()))

function addColumn() {
  columns.value.push({ uid: `new-${++uidCounter}`, name: '', color: PALETTE[(columns.value.length * 3) % PALETTE.length]!, isDone: false })
  nextTick(() => columnList.value?.querySelector<HTMLInputElement>('li:last-child input')?.focus())
}
function removeColumn(index: number) {
  columns.value.splice(index, 1)
}
function moveColumn(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= columns.value.length) return
  const list = [...columns.value]
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item!)
  columns.value = list
}

const savingWorkflow = ref(false)
async function saveWorkflow() {
  if (!workflowValid.value) return
  savingWorkflow.value = true
  try {
    const statuses = await $fetch<StatusDTO[]>(`/api/projects/${props.project.key}/statuses`, {
      method: 'PUT',
      body: { statuses: columns.value.map((c) => ({ id: c.id, name: c.name.trim(), color: c.color, isDone: c.isDone })) },
    })
    emit('updated', { ...props.project, statuses })
    resetColumns(statuses)
    toast.add({ title: 'Workflow saved', color: 'success' })
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not save the workflow') })
  } finally {
    savingWorkflow.value = false
  }
}

function resetColumns(list: StatusDTO[] = originalColumns.value) {
  columns.value = [...list].sort((a, b) => a.position - b.position).map((s) => ({ uid: `s-${s.id}`, id: s.id, name: s.name, color: s.color, isDone: s.isDone }))
}

// --- labels -------------------------------------------------------------------------------------------------------
const labelList = ref<LabelDTO[]>([])
watch(
  () => props.labels,
  (list) => (labelList.value = list.map((l) => ({ ...l }))),
  { immediate: true },
)
const sortedLabels = computed(() => [...labelList.value].sort((a, b) => a.name.localeCompare(b.name)))

function publishLabels() {
  emit('update:labels', labelList.value.map((l) => ({ ...l })))
}

async function updateLabel(label: LabelDTO, body: { name?: string; color?: string }) {
  const original = props.labels.find((l) => l.id === label.id)
  if (body.name !== undefined) {
    body.name = body.name.trim()
    if (!body.name || body.name === original?.name) {
      label.name = original?.name ?? label.name
      return
    }
  }
  const before = { ...label }
  Object.assign(label, body)
  try {
    Object.assign(label, await $fetch<LabelDTO>(`/api/labels/${label.id}`, { method: 'PATCH', body }))
    publishLabels()
  } catch (e) {
    Object.assign(label, before, original ? { name: original.name } : {})
    toast.add({ color: 'error', title: errorMessage(e, 'Could not update the label') })
  }
}

const deletingLabel = ref<LabelDTO | null>(null)
async function deleteLabel() {
  const label = deletingLabel.value
  if (!label) return
  try {
    await $fetch(`/api/labels/${label.id}`, { method: 'DELETE' })
    labelList.value = labelList.value.filter((l) => l.id !== label.id)
    publishLabels()
    deletingLabel.value = null
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not delete the label') })
  }
}

const newLabel = reactive({ name: '', color: 'blue' })
const addingLabel = ref(false)
async function addLabel() {
  const name = newLabel.name.trim()
  if (!name) return
  addingLabel.value = true
  try {
    const label = await $fetch<LabelDTO>('/api/labels', { method: 'POST', body: { name, color: newLabel.color } })
    if (!labelList.value.some((l) => l.id === label.id)) labelList.value.push(label)
    publishLabels()
    newLabel.name = ''
    newLabel.color = PALETTE[Math.floor(Math.random() * (PALETTE.length - 1)) + 1]!
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not add the label') })
  } finally {
    addingLabel.value = false
  }
}

// Fresh form state each time the dialog opens.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    Object.assign(general, { name: props.project.name, description: props.project.description, color: props.project.color })
    deleteConfirm.value = ''
    resetColumns()
  },
  { immediate: true },
)
</script>

<template>
  <UModal v-model:open="open" title="Project settings" :description="`${project.name} · ${project.key}`" :ui="{ content: 'sm:max-w-2xl', body: 'p-0 sm:p-0' }">
    <template #body>
      <UTabs v-model="tab" :items="tabs" :content="false" variant="link" size="sm" class="border-b border-default px-4 sm:px-6" :ui="{ list: 'border-none' }" />

      <!-- General -->
      <div v-if="tab === 'general'" class="space-y-6 p-4 sm:p-6">
        <form class="space-y-4" @submit.prevent="saveGeneral">
          <UFormField label="Name" required>
            <UInput v-model="general.name" class="w-full" maxlength="80" />
          </UFormField>
          <UFormField label="Description" hint="Optional">
            <UTextarea v-model="general.description" class="w-full" :rows="3" autoresize :maxrows="8" maxlength="2000" placeholder="What is this project about?" />
          </UFormField>
          <UFormField label="Colour">
            <ProjectColorSwatches v-model="general.color" label="Project colour" />
          </UFormField>
          <div class="flex justify-end">
            <UButton type="submit" label="Save changes" :loading="savingGeneral" :disabled="!generalDirty || !general.name.trim()" />
          </div>
        </form>

        <USeparator />

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">{{ project.archivedAt ? 'Restore project' : 'Archive project' }}</p>
            <p class="text-sm text-muted">
              {{ project.archivedAt ? 'Bring it back to the sidebar and project list.' : 'Hide it from the sidebar. Tasks stay intact and you can restore it any time.' }}
            </p>
          </div>
          <UButton
            :icon="project.archivedAt ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
            :label="project.archivedAt ? 'Unarchive' : 'Archive'"
            color="neutral"
            variant="outline"
            :loading="archiving"
            @click="toggleArchived"
          />
        </div>

        <template v-if="isAdmin">
          <USeparator />
          <div class="space-y-3 rounded-lg p-4 ring ring-error/40">
            <div>
              <p class="text-sm font-medium text-error">Delete project</p>
              <p class="text-sm text-muted">Removes every task, comment and file in {{ project.name }}. This cannot be undone.</p>
            </div>
            <form class="flex flex-wrap items-end gap-2" @submit.prevent="deleteProject">
              <UFormField :label="`Type ${project.key} to confirm`" class="min-w-48 flex-1">
                <UInput v-model="deleteConfirm" class="w-full" autocomplete="off" :placeholder="project.key" />
              </UFormField>
              <UButton
                type="submit"
                color="error"
                icon="i-lucide-trash-2"
                label="Delete project"
                :loading="deleting"
                :disabled="deleteConfirm.trim().toUpperCase() !== project.key"
              />
            </form>
          </div>
        </template>
      </div>

      <!-- Workflow -->
      <div v-else-if="tab === 'workflow'" class="space-y-4 p-4 sm:p-6">
        <p class="text-sm text-muted">Columns appear on the board in this order. Tasks in a "Done" column count as completed.</p>

        <ul ref="columnList" class="space-y-1.5">
          <li v-for="(column, index) in columns" :key="column.uid" class="flex items-center gap-2 rounded-lg bg-default p-1.5 ring ring-default">
            <button
              type="button"
              data-drag-handle
              class="cursor-grab rounded p-0.5 text-dimmed hover:text-highlighted active:cursor-grabbing"
              aria-label="Drag to reorder"
              tabindex="-1"
            >
              <UIcon name="i-lucide-grip-vertical" class="size-4" />
            </button>
            <UPopover>
              <UButton color="neutral" variant="ghost" size="sm" square :aria-label="`Colour of ${column.name || 'column'}: ${column.color}`">
                <span class="size-3 rounded-full" :class="color(column.color).dot" />
              </UButton>
              <template #content>
                <div class="w-56 p-2">
                  <ProjectColorSwatches v-model="column.color" :label="`Colour of ${column.name || 'column'}`" />
                </div>
              </template>
            </UPopover>
            <UInput v-model="column.name" size="sm" class="min-w-0 flex-1" maxlength="40" placeholder="Column name" :aria-label="`Column ${index + 1} name`" />
            <USwitch v-model="column.isDone" size="sm" label="Done" :ui="{ label: 'text-xs text-muted' }" />
            <div class="flex items-center">
              <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :disabled="index === 0" aria-label="Move up" @click="moveColumn(index, -1)" />
              <UButton
                icon="i-lucide-chevron-down"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="index === columns.length - 1"
                aria-label="Move down"
                @click="moveColumn(index, 1)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="columns.length === 1"
                :aria-label="`Remove ${column.name || 'column'}`"
                @click="removeColumn(index)"
              />
            </div>
          </li>
        </ul>

        <UButton icon="i-lucide-plus" label="Add column" color="neutral" variant="outline" size="sm" :disabled="columns.length >= 12" @click="addColumn" />

        <UAlert
          v-if="removedWithTasks.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`Removing ${removedWithTasks.map((s) => s.name).join(', ')}`"
          :description="`Tasks in removed columns move to “${columns[0]?.name || 'the first column'}”.`"
        />

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Reset" :disabled="!workflowDirty" @click="resetColumns()" />
          <UButton label="Save workflow" :loading="savingWorkflow" :disabled="!workflowDirty || !workflowValid" @click="saveWorkflow" />
        </div>
      </div>

      <!-- Labels -->
      <div v-else class="space-y-4 p-4 sm:p-6">
        <p class="text-sm text-muted">Labels are shared by every project in the workspace.</p>

        <form class="flex items-center gap-2" @submit.prevent="addLabel">
          <UPopover>
            <UButton color="neutral" variant="outline" size="sm" square :aria-label="`New label colour: ${newLabel.color}`">
              <span class="size-3 rounded-full" :class="color(newLabel.color).dot" />
            </UButton>
            <template #content>
              <div class="w-56 p-2">
                <ProjectColorSwatches v-model="newLabel.color" label="New label colour" />
              </div>
            </template>
          </UPopover>
          <UInput v-model="newLabel.name" size="sm" class="flex-1" maxlength="40" placeholder="New label" aria-label="New label name" />
          <UButton type="submit" size="sm" icon="i-lucide-plus" label="Add" :loading="addingLabel" :disabled="!newLabel.name.trim()" />
        </form>

        <UEmpty v-if="!sortedLabels.length" icon="i-lucide-tags" title="No labels yet" description="Add one above, or type a new name in a task's label picker." size="sm" />
        <ul v-else class="divide-y divide-default rounded-lg ring ring-default">
          <li v-for="label in sortedLabels" :key="label.id" class="flex items-center gap-2 px-2 py-1.5">
            <UPopover>
              <UButton color="neutral" variant="ghost" size="sm" square :aria-label="`Colour of ${label.name}: ${label.color}`">
                <span class="size-3 rounded-full" :class="color(label.color).dot" />
              </UButton>
              <template #content>
                <div class="w-56 p-2">
                  <ProjectColorSwatches
                    :model-value="label.color"
                    :label="`Colour of ${label.name}`"
                    @update:model-value="(c) => updateLabel(label, { color: c })"
                  />
                </div>
              </template>
            </UPopover>
            <UInput
              v-model="label.name"
              size="sm"
              variant="ghost"
              class="flex-1"
              maxlength="40"
              aria-label="Label name"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
              @blur="updateLabel(label, { name: label.name })"
            />
            <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="xs" :aria-label="`Delete ${label.name}`" @click="deletingLabel = label" />
          </li>
        </ul>
      </div>
    </template>
  </UModal>

  <UModal
    :open="deletingLabel !== null"
    :title="`Delete “${deletingLabel?.name}”?`"
    description="The label is removed from every task in every project."
    @update:open="(v) => !v && (deletingLabel = null)"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Keep it" @click="deletingLabel = null" />
        <UButton color="error" icon="i-lucide-trash-2" label="Delete label" @click="deleteLabel" />
      </div>
    </template>
  </UModal>
</template>
