<script setup lang="ts">
/** The organisation's logo (or the default mark) and name, from Settings → Branding. */
withDefaults(defineProps<{ size?: 'md' | 'lg'; hideName?: boolean }>(), { size: 'md', hideName: false })
const { site } = useSite()
</script>

<template>
  <span class="flex min-w-0 items-center gap-2">
    <img
      v-if="site.logoUrl"
      :src="site.logoUrl"
      alt=""
      class="shrink-0 object-contain"
      :class="size === 'lg' ? 'h-9 max-w-40' : 'h-8 max-w-32'"
    />
    <span v-else class="grid shrink-0 place-items-center rounded-lg bg-primary text-inverted" :class="size === 'lg' ? 'size-9' : 'size-8'">
      <UIcon name="i-lucide-ticket-check" class="size-5" />
    </span>
    <span v-if="!hideName" class="truncate tracking-tight" :class="size === 'lg' ? 'text-xl' : 'text-lg'">{{ site.name }}</span>
  </span>
</template>
