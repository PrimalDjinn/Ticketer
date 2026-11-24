<script setup lang="ts">
import { z } from 'zod'

/**
 * "Back to <app>" for people who arrived from another app's launch link with a return URL (the server sets the
 * `ticketer-back` cookie only for origins the admin allowed). Place it in a layout; it renders nothing otherwise.
 */
const shape = z.object({
  name: z.string().min(1).max(80),
  url: z.url().refine((v) => /^https?:\/\//i.test(v)),
})
const cookie = useCookie<unknown>('ticketer-back', { default: () => null, sameSite: 'lax', path: '/' })
const back = computed(() => {
  const parsed = shape.safeParse(cookie.value)
  return parsed.success ? parsed.data : null
})

function dismiss() {
  cookie.value = null
}
</script>

<template>
  <div v-if="back" class="flex items-center gap-1">
    <UButton :to="back.url" external size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="`Back to ${back.name}`" class="min-w-0 truncate" />
    <UButton size="xs" color="neutral" variant="link" icon="i-lucide-x" aria-label="Hide the back link" @click="dismiss" />
  </div>
</template>
