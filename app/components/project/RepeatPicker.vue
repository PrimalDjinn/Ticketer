<script setup lang="ts">
import { z } from 'zod'

/** Repeat rule picker: None / Daily / Weekly / Monthly / Yearly / Every N days (with the interval input). */
const props = withDefaults(
  defineProps<{
    repeat: TaskRepeat | null
    interval: number | null
    disabled?: boolean
    variant?: 'ghost' | 'soft' | 'outline'
    /** Sidebar style: full-width ghost select without the trailing chevron. */
    inline?: boolean
  }>(),
  { variant: 'ghost' },
)
const emit = defineEmits<{ change: [value: { repeat: TaskRepeat | null; repeatInterval: number | null }] }>()

const NONE = 'none'
type Choice = TaskRepeat | typeof NONE
const items: { label: string; value: Choice; icon: string }[] = [
  { label: 'Does not repeat', value: NONE, icon: 'i-lucide-circle-slash' },
  ...TASK_REPEATS.map((r) => ({ label: repeatMeta[r].label, value: r, icon: r === 'periodically' ? 'i-lucide-calendar-sync' : 'i-lucide-repeat' })),
]

const DEFAULT_INTERVAL = 7
const intervalSchema = z.coerce.number().int().min(1).max(3650)
const intervalDraft = ref(String(props.interval ?? DEFAULT_INTERVAL))
watch(
  () => props.interval,
  (value) => (intervalDraft.value = String(value ?? DEFAULT_INTERVAL)),
)

function choose(value: Choice) {
  const repeat = value === NONE ? null : value
  if (repeat === props.repeat) return
  const parsed = intervalSchema.safeParse(intervalDraft.value)
  emit('change', { repeat, repeatInterval: repeat === 'periodically' ? (parsed.success ? parsed.data : DEFAULT_INTERVAL) : null })
}

function commitInterval() {
  const parsed = intervalSchema.safeParse(intervalDraft.value)
  if (!parsed.success) {
    intervalDraft.value = String(props.interval ?? DEFAULT_INTERVAL)
    return
  }
  intervalDraft.value = String(parsed.data)
  if (parsed.data !== props.interval) emit('change', { repeat: 'periodically', repeatInterval: parsed.data })
}

const ui = computed(() =>
  props.inline
    ? { base: 'w-full justify-start px-2 text-sm md:text-sm disabled:opacity-100 disabled:cursor-default', trailingIcon: 'hidden', content: 'min-w-52' }
    : { content: 'min-w-52' },
)
const current = computed(() => items.find((i) => i.value === (props.repeat ?? NONE))!)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1">
    <div class="flex min-w-0 items-center gap-1.5">
      <USelectMenu
        :model-value="repeat ?? NONE"
        :items="items"
        value-key="value"
        :search-input="false"
        :variant="variant"
        size="sm"
        :disabled="disabled"
        :ui="ui"
        :class="inline && 'min-w-0 flex-1'"
        aria-label="Repeat"
        @update:model-value="choose"
      >
        <span class="flex min-w-0 items-center gap-2">
          <UIcon :name="repeat ? 'i-lucide-repeat' : 'i-lucide-circle-slash'" class="size-4 shrink-0" :class="repeat ? 'text-primary' : 'text-dimmed'" />
          <span class="truncate" :class="!repeat && 'text-muted'">{{ repeat === 'periodically' ? 'Every' : repeat ? current.label : inline ? 'None' : 'Repeat' }}</span>
        </span>
      </USelectMenu>
      <template v-if="repeat === 'periodically'">
        <UInput
          v-model="intervalDraft"
          type="number"
          inputmode="numeric"
          min="1"
          max="3650"
          size="sm"
          :variant="inline ? 'outline' : variant"
          :disabled="disabled"
          class="w-16 shrink-0"
          aria-label="Repeat every how many days"
          @blur="commitInterval"
          @keydown.enter.prevent="commitInterval"
        />
        <span class="shrink-0 text-sm text-muted">days</span>
      </template>
    </div>
    <p v-if="repeat && inline" class="px-2 text-xs text-dimmed">{{ REPEAT_HINT }}</p>
  </div>
</template>
