<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import { z } from 'zod'

/** "Fields" tab of the project settings: edits the whole list of custom fields and saves it in one PUT. */
const props = defineProps<{ project: ProjectDTO }>()
const emit = defineEmits<{ updated: [project: ProjectDTO] }>()

const toast = useToast()

interface Choice {
  uid: string
  value: string
}
interface Draft {
  uid: string
  id?: number
  name: string
  type: FieldType
  options: Choice[]
  required: boolean
}

const MAX_FIELDS = 20
const MAX_OPTIONS = 50
let uidCounter = 0
const uid = (prefix: string) => `${prefix}-${++uidCounter}`
const hasOptions = (type: FieldType) => type === 'select' || type === 'multiselect'

const original = computed(() => [...props.project.fields].sort((a, b) => a.position - b.position))
const drafts = ref<Draft[]>([])
const list = useTemplateRef<HTMLElement>('list')
useSortable(list, drafts, { handle: '[data-drag-handle]', animation: 150, watchElement: true })

function reset(fields: FieldDTO[] = original.value) {
  drafts.value = [...fields]
    .sort((a, b) => a.position - b.position)
    .map((f) => ({ uid: `f-${f.id}`, id: f.id, name: f.name, type: f.type, required: f.required, options: f.options.map((value) => ({ uid: uid('o'), value })) }))
}
reset()

const typeItems = FIELD_TYPES.map((t) => ({ label: fieldTypeMeta[t].label, value: t, icon: fieldTypeMeta[t].icon }))

/** The exact body the server expects (also used to detect changes). */
const payloadSchema = z.array(
  z.object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(40),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(40)).max(MAX_OPTIONS),
    required: z.boolean(),
  }),
)
const payload = computed(() =>
  drafts.value.map((d) => ({
    id: d.id,
    name: d.name.trim(),
    type: d.type,
    options: hasOptions(d.type) ? [...new Set(d.options.map((o) => o.value.trim()).filter(Boolean))] : [],
    required: d.required,
  })),
)
const dirty = computed(() => {
  const was = original.value.map((f) => ({ id: f.id, name: f.name, type: f.type, options: hasOptions(f.type) ? f.options : [], required: f.required }))
  return JSON.stringify(payload.value) !== JSON.stringify(was)
})
const problems = computed(() => {
  const out: string[] = []
  if (!payloadSchema.safeParse(payload.value).success) out.push('Every field needs a name (up to 40 characters).')
  const noChoices = payload.value.filter((f) => hasOptions(f.type) && !f.options.length)
  if (noChoices.length) out.push(`Add at least one choice to ${noChoices.map((f) => f.name || 'the new field').join(', ')}.`)
  return out
})
const removed = computed(() => original.value.filter((f) => !drafts.value.some((d) => d.id === f.id)))

function addField() {
  drafts.value.push({ uid: uid('new'), name: '', type: 'text', options: [], required: false })
  nextTick(() => list.value?.querySelector<HTMLInputElement>('li:last-child input[data-field-name]')?.focus())
}
function removeField(index: number) {
  drafts.value.splice(index, 1)
}
function moveField(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= drafts.value.length) return
  const next = [...drafts.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  drafts.value = next
}
function setType(draft: Draft, type: FieldType) {
  if (draft.id) return // types are fixed once saved
  draft.type = type
  if (hasOptions(type) && !draft.options.length) draft.options.push({ uid: uid('o'), value: '' })
}

// --- choices ------------------------------------------------------------------------------------------------------
const newChoice = reactive<Record<string, string>>({})
function addChoice(draft: Draft) {
  const value = (newChoice[draft.uid] ?? '').trim()
  if (!value || draft.options.length >= MAX_OPTIONS) return
  if (draft.options.some((o) => o.value.trim().toLowerCase() === value.toLowerCase())) {
    toast.add({ color: 'warning', title: `“${value}” is already a choice` })
    return
  }
  // Fill an empty placeholder chip first.
  const blank = draft.options.find((o) => !o.value.trim())
  if (blank) blank.value = value
  else draft.options.push({ uid: uid('o'), value })
  newChoice[draft.uid] = ''
}
function removeChoice(draft: Draft, choice: Choice) {
  draft.options = draft.options.filter((o) => o.uid !== choice.uid)
}

// --- save ---------------------------------------------------------------------------------------------------------
const saving = ref(false)
async function save() {
  if (problems.value.length || !dirty.value) return
  saving.value = true
  try {
    const fields = await $fetch<FieldDTO[]>(`/api/projects/${props.project.key}/fields`, { method: 'PUT', body: { fields: payload.value } })
    emit('updated', { ...props.project, fields })
    reset(fields)
    toast.add({ title: 'Fields saved', color: 'success' })
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not save the fields') })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4 p-4 sm:p-6">
    <p class="text-sm text-muted">Custom fields appear on every task in this project, in this order. Required fields must be filled in when creating a task from the full form.</p>

    <UEmpty v-if="!drafts.length" icon="i-lucide-text-cursor-input" title="No custom fields" description="Track things like environment, estimate or customer on each task." size="sm" />
    <ul ref="list" class="space-y-1.5">
      <li v-for="(draft, index) in drafts" :key="draft.uid" class="space-y-2 rounded-lg bg-default p-1.5 ring ring-default">
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-drag-handle
            class="cursor-grab rounded p-0.5 text-dimmed hover:text-highlighted active:cursor-grabbing"
            aria-label="Drag to reorder"
            tabindex="-1"
          >
            <UIcon name="i-lucide-grip-vertical" class="size-4" />
          </button>
          <UInput
            v-model="draft.name"
            data-field-name
            size="sm"
            class="min-w-32 flex-1"
            maxlength="40"
            placeholder="Field name"
            :aria-label="`Field ${index + 1} name`"
          />
          <UTooltip :text="draft.id ? 'The type of a saved field cannot change; remove it and add a new one' : 'Field type'" :disabled="!draft.id">
            <USelect
              :model-value="draft.type"
              :items="typeItems"
              :icon="fieldTypeMeta[draft.type].icon"
              size="sm"
              class="w-36"
              :disabled="!!draft.id"
              :aria-label="`Type of ${draft.name || 'field'}`"
              @update:model-value="(t) => setType(draft, t)"
            />
          </UTooltip>
          <USwitch v-model="draft.required" size="sm" label="Required" :ui="{ label: 'text-xs text-muted' }" />
          <div class="flex items-center">
            <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :disabled="index === 0" aria-label="Move up" @click="moveField(index, -1)" />
            <UButton
              icon="i-lucide-chevron-down"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="index === drafts.length - 1"
              aria-label="Move down"
              @click="moveField(index, 1)"
            />
            <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="xs" :aria-label="`Remove ${draft.name || 'field'}`" @click="removeField(index)" />
          </div>
        </div>

        <!-- Choices for select / multi-select -->
        <div v-if="hasOptions(draft.type)" class="ms-7 space-y-1.5 pb-1">
          <p class="text-xs text-muted">Choices</p>
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              v-for="choice in draft.options"
              :key="choice.uid"
              class="inline-flex items-center rounded-full bg-elevated ps-1 pe-0.5 ring ring-default focus-within:ring-primary"
            >
              <input
                v-model="choice.value"
                maxlength="40"
                placeholder="Choice"
                class="field-sizing-content min-w-12 bg-transparent px-1 py-0.5 text-xs text-default outline-none placeholder:text-dimmed"
                :aria-label="`Choice of ${draft.name || 'field'}`"
              />
              <button
                type="button"
                class="grid size-4 place-items-center rounded-full text-dimmed hover:text-error focus-visible:outline-2 focus-visible:outline-primary"
                :aria-label="`Remove choice ${choice.value}`"
                @click="removeChoice(draft, choice)"
              >
                <UIcon name="i-lucide-x" class="size-3" />
              </button>
            </span>
            <form class="inline-flex items-center gap-1" @submit.prevent="addChoice(draft)">
              <UInput
                v-model="newChoice[draft.uid]"
                size="xs"
                maxlength="40"
                class="w-32"
                placeholder="Add a choice"
                :aria-label="`Add a choice to ${draft.name || 'field'}`"
              />
              <UButton type="submit" icon="i-lucide-plus" size="xs" color="neutral" variant="ghost" aria-label="Add choice" :disabled="!newChoice[draft.uid]?.trim()" />
            </form>
          </div>
        </div>
      </li>
    </ul>

    <UButton icon="i-lucide-plus" label="Add field" color="neutral" variant="outline" size="sm" :disabled="drafts.length >= MAX_FIELDS" @click="addField" />

    <UAlert
      v-if="removed.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`Removing ${removed.map((f) => f.name).join(', ')}`"
      description="The values stored on tasks for removed fields are deleted when you save."
    />
    <ul v-if="dirty && problems.length" class="list-inside list-disc text-sm text-error">
      <li v-for="problem in problems" :key="problem">{{ problem }}</li>
    </ul>

    <div class="flex justify-end gap-2">
      <UButton color="neutral" variant="ghost" label="Reset" :disabled="!dirty" @click="reset()" />
      <UButton label="Save fields" :loading="saving" :disabled="!dirty || problems.length > 0" @click="save" />
    </div>
  </div>
</template>
