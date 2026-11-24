<script setup lang="ts">
/** A copyable code sample. */
const props = defineProps<{ code: string; label?: string }>()
const copied = ref(false)
async function copy() {
  await navigator.clipboard.writeText(props.code)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="overflow-hidden rounded-md border border-default bg-elevated/40">
    <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-1">
      <span class="text-xs font-medium text-muted">{{ label }}</span>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        :label="copied ? 'Copied' : 'Copy'"
        :aria-label="`Copy ${label ?? 'code'}`"
        @click="copy"
      />
    </div>
    <pre class="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-default"><code>{{ code }}</code></pre>
  </div>
</template>
