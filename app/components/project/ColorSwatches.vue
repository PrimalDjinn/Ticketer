<script setup lang="ts">
/** Palette picker: one round swatch per PALETTE colour, behaving as a radio group. */
const model = defineModel<string>({ required: true })
defineProps<{ label?: string }>()
</script>

<template>
  <div role="radiogroup" :aria-label="label ?? 'Colour'" class="flex flex-wrap gap-1.5">
    <button
      v-for="c in PALETTE"
      :key="c"
      type="button"
      role="radio"
      :aria-checked="model === c"
      :aria-label="c"
      :title="c"
      class="grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-(--ui-bg) transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="[color(c).dot, model === c && 'ring-2 ring-(--ui-border-inverted)']"
      @click="model = c"
    >
      <UIcon v-if="model === c" name="i-lucide-check" class="size-3.5 text-white" />
    </button>
  </div>
</template>
