<script setup lang="ts">
/** Image thumbnails open in a lightbox; every other file is a download chip. */
const props = defineProps<{ attachments: AttachmentDTO[]; compact?: boolean }>()

const images = computed(() => props.attachments.filter((a) => isImage(a.contentType)))
const files = computed(() => props.attachments.filter((a) => !isImage(a.contentType)))
const viewing = ref<number | null>(null)
const current = computed(() => (viewing.value === null ? null : images.value[viewing.value]))

function step(delta: number) {
  if (viewing.value === null) return
  viewing.value = (viewing.value + delta + images.value.length) % images.value.length
}
</script>

<template>
  <div v-if="attachments.length" class="space-y-2">
    <div v-if="images.length" class="flex flex-wrap gap-2">
      <button
        v-for="(image, index) in images"
        :key="image.id"
        type="button"
        class="group relative overflow-hidden rounded-lg ring ring-default transition hover:ring-primary"
        :class="compact ? 'size-20' : 'size-28'"
        :aria-label="`View ${image.name}`"
        @click="viewing = index"
      >
        <img :src="image.url" :alt="image.name" loading="lazy" class="size-full object-cover transition group-hover:scale-105" />
      </button>
    </div>

    <div v-if="files.length" class="flex flex-wrap gap-2">
      <a
        v-for="file in files"
        :key="file.id"
        :href="file.url"
        target="_blank"
        rel="noopener"
        class="flex max-w-64 items-center gap-2 rounded-lg bg-elevated/50 px-3 py-2 text-sm ring ring-default transition hover:bg-elevated hover:ring-primary"
      >
        <UIcon :name="fileIcon(file.contentType)" class="size-5 shrink-0 text-primary" />
        <span class="min-w-0">
          <span class="block truncate text-highlighted">{{ file.name }}</span>
          <span class="block text-xs text-muted">{{ fileSize(file.size) }}</span>
        </span>
      </a>
    </div>

    <UModal :open="current !== null" :title="current?.name" fullscreen @update:open="(v) => !v && (viewing = null)">
      <template #body>
        <div v-if="current" class="relative flex h-full items-center justify-center">
          <img :src="current.url" :alt="current.name" class="max-h-full max-w-full rounded-lg object-contain" />
          <template v-if="images.length > 1">
            <UButton class="absolute left-2" icon="i-lucide-chevron-left" color="neutral" variant="subtle" aria-label="Previous" @click="step(-1)" />
            <UButton class="absolute right-2" icon="i-lucide-chevron-right" color="neutral" variant="subtle" aria-label="Next" @click="step(1)" />
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between text-sm text-muted">
          <span>{{ current ? fileSize(current.size) : '' }}</span>
          <UButton v-if="current" :to="`${current.url}?download=1`" external icon="i-lucide-download" label="Download" variant="subtle" />
        </div>
      </template>
    </UModal>
  </div>
</template>
