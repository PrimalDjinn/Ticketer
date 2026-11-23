<script setup lang="ts">
const props = defineProps<{ status: TicketStatus; size?: 'sm' | 'md' }>()
const meta = computed(() => statusMeta[props.status])
</script>

<template>
  <UBadge :color="meta.color" variant="subtle" :icon="meta.icon" :label="meta.label" :size="size ?? 'md'" />
</template>
