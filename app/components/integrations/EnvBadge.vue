<script setup lang="ts">
/** Marks a setting pinned by an environment variable (read-only in Settings). */
defineProps<{ name: string }>()
</script>

<template>
  <UTooltip :text="`Set by the server environment (${name}); change it there.`">
    <UBadge color="neutral" variant="subtle" size="sm" icon="i-lucide-lock" :label="name" class="font-mono" />
  </UTooltip>
</template>
