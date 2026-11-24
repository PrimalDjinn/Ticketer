<script setup lang="ts">
/** Settings → Branding: the name, logo, colour and website people see in the app, on the public pages and in emails. */
definePageMeta({ middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'Branding · Settings' })

interface BrandingView {
  name: string
  nameLocked: boolean
  logoUrl: string | null
  accent: AccentColor
  website: string
}

const toast = useToast()
const { refreshSite } = useSite()
const { data, refresh } = await useFetch<BrandingView>('/api/settings/branding')

const state = reactive({ name: '', accent: 'indigo' as AccentColor, website: '' })
watch(
  data,
  (value) => {
    if (value) Object.assign(state, { name: value.name, accent: value.accent, website: value.website })
  },
  { immediate: true },
)
const changed = computed(() => !!data.value && (state.name !== data.value.name || state.accent !== data.value.accent || state.website !== data.value.website))

// Live preview of the accent while choosing; put back if the page is left unsaved.
const appConfig = useAppConfig()
watch(() => state.accent, (accent) => (appConfig.ui.colors.primary = accent))
onBeforeUnmount(() => {
  if (data.value) appConfig.ui.colors.primary = data.value.accent
})

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const site = await $fetch<SiteInfo>('/api/settings/branding', { method: 'PUT', body: { name: state.name, accent: state.accent, website: state.website.trim() } })
    await refreshSite(site)
    await refresh()
    toast.add({ title: 'Branding saved', color: 'success' })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save'), color: 'error' })
  } finally {
    saving.value = false
  }
}

const fileInput = useTemplateRef<HTMLInputElement>('file')
const uploading = ref(false)
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.set('logo', file)
    await refreshSite(await $fetch<SiteInfo>('/api/settings/branding/logo', { method: 'POST', body: form }))
    await refresh()
    toast.add({ title: 'Logo updated', color: 'success' })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not upload the logo'), color: 'error' })
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
async function removeLogo() {
  try {
    await refreshSite(await $fetch<SiteInfo>('/api/settings/branding/logo', { method: 'DELETE' }))
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}

</script>

<template>
  <div v-if="data" class="space-y-8">
    <div>
      <h1 class="text-lg font-semibold text-highlighted">Branding</h1>
      <p class="text-sm text-muted">How this site introduces itself: in the app, on the public help and status pages, and in emails.</p>
    </div>

    <section class="space-y-3">
      <h2 class="text-sm font-semibold text-highlighted">Logo</h2>
      <div class="flex flex-wrap items-center gap-4">
        <div class="grid h-16 min-w-16 place-items-center rounded-lg border border-default bg-elevated/40 px-3">
          <img v-if="data.logoUrl" :src="data.logoUrl" alt="Current logo" class="h-10 max-w-48 object-contain" />
          <UIcon v-else name="i-lucide-image" class="size-6 text-dimmed" />
        </div>
        <div class="flex flex-wrap gap-2">
          <input ref="file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden" @change="upload" />
          <UButton :label="data.logoUrl ? 'Replace' : 'Upload logo'" icon="i-lucide-upload" color="neutral" variant="outline" :loading="uploading" @click="fileInput?.click()" />
          <UButton v-if="data.logoUrl" label="Remove" color="neutral" variant="ghost" @click="removeLogo" />
        </div>
      </div>
      <p class="text-sm text-muted">PNG, JPEG, WebP or SVG, up to 512 KB. Shown about 32 pixels tall, and used as the browser tab icon. Emails use PNG, JPEG or WebP logos only (many mail apps don't show SVG).</p>
    </section>

    <form class="space-y-6" @submit.prevent="save">
      <UFormField
        label="Name"
        name="name"
        :help="data.nameLocked ? 'Set by the NUXT_PUBLIC_APP_NAME environment variable.' : 'Your organisation or product, e.g. “Acme Support”. Shown next to the logo, in page titles and in emails.'"
      >
        <UInput v-model="state.name" placeholder="Ticketer" :maxlength="60" class="w-full sm:w-96" :disabled="data.nameLocked" :trailing-icon="data.nameLocked ? 'i-lucide-lock' : undefined" />
      </UFormField>

      <UFormField label="Accent colour" name="accent" help="Buttons, links and highlights. Previewed as you pick; saved for everyone with Save.">
        <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
          <button
            v-for="name in ACCENT_COLOR_NAMES"
            :key="name"
            type="button"
            role="radio"
            :aria-checked="state.accent === name"
            :aria-label="name"
            :title="name"
            class="grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-(--ui-bg) transition focus-visible:outline-2 focus-visible:outline-primary"
            :class="state.accent === name ? 'ring-2 ring-(--ui-text-highlighted)' : 'hover:scale-110'"
            :style="{ backgroundColor: ACCENT_COLORS[name] }"
            @click="state.accent = name"
          >
            <UIcon v-if="state.accent === name" name="i-lucide-check" class="size-4 text-white" />
          </button>
        </div>
      </UFormField>

      <UFormField label="Website" name="website" help="Linked from the public help pages, so visitors can get back to you.">
        <UInput v-model="state.website" type="url" placeholder="https://example.com" class="w-full sm:w-96" />
      </UFormField>

      <div class="flex justify-end">
        <UButton type="submit" label="Save" :loading="saving" :disabled="!changed" />
      </div>
    </form>
  </div>
</template>
