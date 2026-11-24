<script setup lang="ts">
import { z } from 'zod'

/**
 * Editor for one custom field value, suited to its type. Emits `commit` with the new value (`null` clears it):
 * text and number commit on blur / Enter (or on every keystroke with `live`), everything else on change.
 */
const props = withDefaults(
  defineProps<{
    field: FieldDTO
    value: FieldValue | null | undefined
    disabled?: boolean
    variant?: 'ghost' | 'outline' | 'soft'
    /** Sidebar style (compact ghost controls, no chevrons). */
    inline?: boolean
    /** Commit text / number on every input (forms submitted as a whole). */
    live?: boolean
    invalid?: boolean
  }>(),
  { variant: 'ghost' },
)
const emit = defineEmits<{ commit: [value: FieldValue | null] }>()

const label = computed(() => props.field.name)

const asString = (v: FieldValue | null | undefined) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const asStrings = (v: FieldValue | null | undefined) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [])
const asBool = (v: FieldValue | null | undefined) => v === true

// --- text / number: a local draft committed on blur or Enter ------------------------------------------------------
const draft = ref(asString(props.value))
const numberSchema = z.coerce.number().finite()

function parsed(): { ok: true; value: FieldValue | null } | { ok: false } {
  // A number input hands v-model a number at runtime, whatever the ref's declared type.
  const raw = String(draft.value ?? '').trim()
  if (!raw) return { ok: true, value: null }
  if (props.field.type !== 'number') return { ok: true, value: raw }
  const n = numberSchema.safeParse(raw)
  return n.success ? { ok: true, value: n.data } : { ok: false }
}

// Follow outside changes (realtime, rollback) unless the draft already says the same thing.
watch(
  () => props.value,
  (v) => {
    const current = parsed()
    if (!current.ok || current.value !== (v ?? null)) draft.value = asString(v)
  },
)

function commitDraft() {
  const result = parsed()
  if (!result.ok) {
    if (!props.live) draft.value = asString(props.value)
    return
  }
  const before = props.value ?? null
  if (result.value !== before) emit('commit', result.value)
}
// UInput hands back a number for type="number"; keep the draft a string.
function onDraftUpdate(value: string | number | null | undefined) {
  draft.value = value == null ? '' : String(value)
  if (props.live) commitDraft()
}
function onDraftKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && !props.live) {
    event.preventDefault()
    ;(event.target as HTMLInputElement).blur()
  } else if (event.key === 'Escape' && !props.live && draft.value !== asString(props.value)) {
    event.stopPropagation()
    draft.value = asString(props.value)
  }
}

// --- select / multiselect -----------------------------------------------------------------------------------------
/** Reka's combobox rejects '' as an item value, so "None" uses a sentinel. */
const NONE = '\u0000none'
const selectItems = computed(() => [
  ...(props.field.required && !props.inline ? [] : [{ label: 'None', value: NONE }]),
  ...props.field.options.map((o) => ({ label: o, value: o })),
])
const multiItems = computed(() => props.field.options.map((o) => ({ label: o, value: o })))

const inlineUi = { base: 'w-full justify-start px-2 text-sm md:text-sm disabled:opacity-100 disabled:cursor-default', trailingIcon: 'hidden', content: 'min-w-48' }
const selectUi = computed(() => (props.inline ? inlineUi : { content: 'min-w-48' }))
const inputUi = computed(() => ({
  base: ['text-sm md:text-sm disabled:opacity-100 disabled:cursor-default', props.inline && 'px-2'],
  root: 'w-full',
}))
const tone = computed(() => (props.invalid ? ('error' as const) : undefined))
</script>

<template>
  <UInput
    v-if="field.type === 'text' || field.type === 'number'"
    :model-value="draft"
    :type="field.type === 'number' ? 'number' : 'text'"
    :inputmode="field.type === 'number' ? 'decimal' : undefined"
    :step="field.type === 'number' ? 'any' : undefined"
    :maxlength="field.type === 'text' ? 500 : undefined"
    :placeholder="disabled ? 'Empty' : field.type === 'number' ? 'Add a number' : 'Add text'"
    :variant="variant"
    :color="tone"
    :highlight="invalid"
    size="sm"
    :disabled="disabled"
    class="w-full"
    :ui="inputUi"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    @update:model-value="onDraftUpdate"
    @blur="commitDraft"
    @keydown="onDraftKey"
  />

  <UInput
    v-else-if="field.type === 'date'"
    type="date"
    :model-value="asString(value)"
    :variant="variant"
    :color="tone"
    :highlight="invalid"
    size="sm"
    :disabled="disabled"
    class="w-full"
    :ui="{ ...inputUi, base: [...inputUi.base, !value && 'text-muted'] }"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    @change="emit('commit', ($event.target as HTMLInputElement).value || null)"
  />

  <USelectMenu
    v-else-if="field.type === 'select'"
    :model-value="asString(value) || NONE"
    :items="selectItems"
    value-key="value"
    :search-input="field.options.length > 8 ? { placeholder: 'Find…' } : false"
    :variant="variant"
    :color="tone"
    :highlight="invalid"
    size="sm"
    :disabled="disabled"
    :ui="selectUi"
    class="w-full"
    :placeholder="disabled ? 'Empty' : 'Choose…'"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    @update:model-value="(v) => (v === NONE ? '' : v) !== asString(value) && emit('commit', v === NONE ? null : v)"
  >
    <span v-if="asString(value)" class="truncate">{{ asString(value) }}</span>
    <span v-else class="truncate text-muted">{{ disabled ? 'Empty' : 'Choose…' }}</span>
  </USelectMenu>

  <USelectMenu
    v-else-if="field.type === 'multiselect'"
    :model-value="asStrings(value)"
    :items="multiItems"
    value-key="value"
    multiple
    :search-input="field.options.length > 8 ? { placeholder: 'Find…' } : false"
    :variant="variant"
    :color="tone"
    :highlight="invalid"
    size="sm"
    :disabled="disabled"
    :ui="inline ? { ...inlineUi, base: `${inlineUi.base} h-auto min-h-7 py-1` } : { content: 'min-w-48' }"
    class="w-full"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    @update:model-value="(v) => emit('commit', v.length ? v : null)"
  >
    <span v-if="asStrings(value).length" class="flex flex-wrap gap-1">
      <span v-for="option in asStrings(value)" :key="option" class="rounded-full px-1.5 py-px text-xs ring ring-inset ring-default">{{ option }}</span>
    </span>
    <span v-else class="truncate text-muted">{{ disabled ? 'Empty' : 'Choose…' }}</span>
  </USelectMenu>

  <div v-else class="flex h-7 items-center" :class="inline && 'px-2'">
    <UCheckbox
      :model-value="asBool(value)"
      :disabled="disabled"
      :color="invalid ? 'error' : 'primary'"
      :aria-label="label"
      @update:model-value="(v) => emit('commit', v === true)"
    />
  </div>
</template>
