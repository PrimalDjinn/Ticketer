<script setup lang="ts">
/** "No known issues" or "N open issues": the one-line status at the top of the public pages. */
const props = defineProps<{ status: PublicOverview['status'] }>()
const tone = computed(() =>
  !props.status.open
    ? { icon: 'i-lucide-circle-check', ring: 'ring-success/30 bg-success/5', iconClass: 'text-success', title: 'No known issues', text: 'Everything is working as expected.' }
    : {
        icon: props.status.urgent ? 'i-lucide-triangle-alert' : 'i-lucide-info',
        ring: props.status.urgent ? 'ring-warning/40 bg-warning/5' : 'ring-info/30 bg-info/5',
        iconClass: props.status.urgent ? 'text-warning' : 'text-info',
        title: `${props.status.open} open issue${props.status.open === 1 ? '' : 's'}`,
        text: 'The team is working on them. Follow one to get updates.',
      },
)
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl px-4 py-3 ring" :class="tone.ring" role="status">
    <UIcon :name="tone.icon" class="size-6 shrink-0" :class="tone.iconClass" />
    <div class="min-w-0">
      <p class="font-medium text-highlighted">{{ tone.title }}</p>
      <p class="text-sm text-muted">{{ tone.text }}</p>
    </div>
  </div>
</template>
