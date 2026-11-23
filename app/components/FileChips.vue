<script setup lang="ts">
/** Compact "attach files" control for composers: a paperclip button plus removable chips. */
const files = defineModel<File[]>({ default: () => [] })
const props = defineProps<{ disabled?: boolean }>()
const input = useTemplateRef<HTMLInputElement>('input')
const toast = useToast()

function add(list: FileList | null) {
  if (!list) return
  const next = [...files.value]
  for (const file of list) {
    if (file.size > UPLOAD_LIMITS.maxBytes) {
      toast.add({ color: 'error', title: `${file.name} is larger than ${UPLOAD_LIMITS.maxSize}` })
      continue
    }
    next.push(file)
  }
  if (next.length > UPLOAD_LIMITS.maxFiles) toast.add({ color: 'warning', title: `Only the first ${UPLOAD_LIMITS.maxFiles} files are kept` })
  files.value = next.slice(0, UPLOAD_LIMITS.maxFiles)
  if (input.value) input.value.value = ''
}

function remove(index: number) {
  files.value = files.value.filter((_, i) => i !== index)
}

defineExpose({ open: () => input.value?.click(), add })
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-1.5">
    <input ref="input" type="file" multiple class="hidden" @change="add(($event.target as HTMLInputElement).files)" />
    <UTooltip text="Attach files">
      <UButton icon="i-lucide-paperclip" color="neutral" variant="ghost" size="sm" square :disabled="props.disabled" aria-label="Attach files" @click="input?.click()" />
    </UTooltip>
    <UBadge
      v-for="(file, index) in files"
      :key="`${file.name}-${index}`"
      color="neutral"
      variant="subtle"
      class="max-w-48 gap-1"
    >
      <UIcon :name="fileIcon(file.type)" class="size-3.5 shrink-0" />
      <span class="truncate">{{ file.name }}</span>
      <button type="button" class="ml-0.5 shrink-0 text-dimmed hover:text-highlighted" :aria-label="`Remove ${file.name}`" @click="remove(index)">
        <UIcon name="i-lucide-x" class="size-3.5" />
      </button>
    </UBadge>
  </div>
</template>
