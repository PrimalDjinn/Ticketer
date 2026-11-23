<script setup lang="ts">
const props = defineProps<{ urgency: TicketUrgency }>()
const meta = computed(() => urgencyMeta[props.urgency])
</script>

<template>
  <UBadge v-if="urgency !== 'Default'" :color="meta.color" variant="soft" icon="i-lucide-flame" :label="meta.label" />
  <span v-else class="text-sm text-muted">Normal</span>
</template>
