<script setup lang="ts">
import { z } from 'zod'
import { createReusableTemplate } from '@vueuse/core'

// Anyone may report an issue. Signed-in people get the app shell; visitors (and guest sessions) get the public layout
// and a guest session when they submit, which they keep if they register afterwards.
definePageMeta({
  middleware: [
    () => {
      const { loggedIn, user } = useUserSession()
      if (!loggedIn.value || user.value?.isGuest) setPageLayout('public')
    },
  ],
})
useSeoMeta({ title: 'New ticket · Ticketer' })

const toast = useToast()
const { staff, registered } = useAccess()
const { fetch: refreshSession } = useUserSession()
const [DefineForm, ReuseForm] = createReusableTemplate()
/** Set after a visitor (no account) submits: they cannot open the ticket page, so show a confirmation instead. */
const submitted = ref<TicketDTO | null>(null)
const { data: signup } = await useFetch<SignupInfo>('/api/auth/signup', { immediate: !registered.value })
const canRegister = computed(() => !!signup.value && (signup.value.firstAccount || signup.value.mode !== 'invite'))
const route = useRoute()

// Other apps can open this page with a prefilled report: ?title=&description=&urgency=&source=. They are only defaults
// the person can edit; anything invalid is ignored and lengths are clamped to the field limits.
const text = (max: number) =>
  z
    .string()
    .transform((v) => v.trim().slice(0, max))
    .optional()
    .catch(undefined)
const prefill = z
  .object({
    title: text(140),
    description: text(10_000),
    urgency: z.enum(TICKET_URGENCIES).optional().catch(undefined),
    // Shown as plain text; control characters dropped.
    source: z
      .string()
      .transform((v) => v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 80))
      .optional()
      .catch(undefined),
  })
  .parse(route.query)

const title = ref(prefill.title ?? '')
const info = ref(prefill.description ?? '')
const source = prefill.source || null
const makePublic = ref(false)
const urgency = ref<TicketUrgency>(prefill.urgency ?? 'Default')
const files = ref<File[]>([])
const loading = ref(false)

const urgencyOptions = [
  { value: 'Default', label: 'Normal', description: 'We will get to it in order' },
  { value: 'Urgent', label: 'Urgent', description: 'Blocking your work' },
  { value: 'Emergency', label: 'Emergency', description: 'Something is down for everyone' },
]

const ready = computed(() => !!title.value.trim() && !!info.value.trim())

async function submit() {
  if (!ready.value) return
  const oversized = files.value.find((f) => f.size > UPLOAD_LIMITS.maxBytes)
  if (oversized) {
    toast.add({ color: 'error', title: `${oversized.name} is larger than ${UPLOAD_LIMITS.maxSize}` })
    return
  }
  loading.value = true
  try {
    const form = new FormData()
    form.set('title', title.value.trim())
    form.set('info', info.value.trim())
    if (staff.value && makePublic.value) form.set('visibility', 'public')
    form.set('urgency', urgency.value)
    for (const file of files.value.slice(0, UPLOAD_LIMITS.maxFiles)) form.append('files', file)
    const ticket = await $fetch<TicketDTO>('/api/tickets', { method: 'POST', body: form })
    if (!registered.value) {
      await refreshSession()
      submitted.value = ticket
      return
    }
    toast.add({ color: 'success', icon: 'i-lucide-circle-check', title: 'Ticket opened', description: `Reference #${shortRef(ticket.reference)}` })
    await navigateTo(`/tickets/${ticket.id}`)
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not open the ticket') })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <DefineForm>
      <form class="mx-auto w-full max-w-2xl space-y-6" @submit.prevent="submit">
        <p v-if="source" class="flex items-center gap-2 rounded-lg bg-elevated/60 px-3 py-2 text-sm text-muted ring ring-default">
          <UIcon name="i-lucide-app-window" class="size-4 shrink-0 text-primary" />
          <span class="min-w-0 truncate">Reporting from <span class="font-medium text-highlighted">{{ source }}</span></span>
        </p>
        <div>
          <h1 class="text-xl font-semibold text-highlighted">What's going on?</h1>
          <p class="mt-1 text-sm text-muted">Include what you expected, what happened instead, and any transaction codes.</p>
        </div>

        <UFormField label="Title" required :hint="`${title.length}/140`">
          <UInput v-model="title" placeholder="A short summary, e.g. “Payments page shows an error”" class="w-full" size="lg" autofocus :maxlength="140" />
        </UFormField>

        <UFormField label="Description" required>
          <UTextarea v-model="info" :rows="7" autoresize placeholder="Describe the problem…" class="w-full" :maxlength="10000" />
        </UFormField>

        <UFormField label="Screenshots and documents" :hint="`Up to ${UPLOAD_LIMITS.maxFiles} files, ${UPLOAD_LIMITS.maxSize} each`">
          <UFileUpload
            v-model="files"
            multiple
            layout="list"
            label="Drop files here"
            description="Images, PDFs, spreadsheets…"
            icon="i-lucide-upload"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Urgency">
          <URadioGroup v-model="urgency" :items="urgencyOptions" variant="card" orientation="horizontal" indicator="hidden" class="w-full" :ui="{ fieldset: 'grid gap-3 sm:grid-cols-3' }" />
        </UFormField>

        <div v-if="staff" class="rounded-lg p-3 ring transition" :class="makePublic ? 'bg-info/5 ring-info/40' : 'ring-default'">
          <USwitch
            v-model="makePublic"
            label="Public"
            description="List it on the public issues page, e.g. a known issue or an announcement. Anyone with the link can read it; signed-in people can follow and reply. Internal notes stay private."
            unchecked-icon="i-lucide-lock"
            checked-icon="i-lucide-globe"
          />
        </div>

        <div class="flex justify-end gap-2 border-t border-default pt-6">
          <UButton :to="registered ? '/' : '/issues'" color="neutral" variant="ghost" label="Cancel" />
          <UButton type="submit" :loading="loading" :disabled="!ready" :icon="makePublic && staff ? 'i-lucide-globe' : 'i-lucide-send'" :label="makePublic && staff ? 'Publish' : 'Open ticket'" />
        </div>
      </form>
  </DefineForm>

  <UDashboardPanel v-if="registered" id="new-ticket">
    <template #header>
      <AppNavbar title="New ticket" />
    </template>
    <template #body>
      <ReuseForm />
    </template>
  </UDashboardPanel>

  <div v-else class="px-4 py-8 sm:py-12">
    <div v-if="submitted" class="mx-auto w-full max-w-xl space-y-6 text-center">
      <span class="mx-auto grid size-12 place-items-center rounded-full bg-success/10 text-success">
        <UIcon name="i-lucide-circle-check" class="size-6" />
      </span>
      <div>
        <h1 class="text-xl font-semibold text-highlighted">Thanks, we've got it</h1>
        <p class="mt-2 text-muted">
          Your reference is <span class="font-mono font-medium text-highlighted">#{{ shortRef(submitted.reference) }}</span>. The team will look at it
          shortly.
        </p>
      </div>
      <div class="rounded-lg bg-elevated/60 p-4 text-left text-sm text-muted ring ring-default">
        <p class="font-medium text-highlighted">Want to follow it?</p>
        <p v-if="canRegister" class="mt-1">Create an account to see replies and get updates. This report moves to your account automatically.</p>
        <p v-else class="mt-1">Keep the reference above. To ask about it, open the chat in this browser and mention the reference.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton v-if="canRegister" to="/auth/register" label="Create an account" icon="i-lucide-user-plus" />
          <UButton color="neutral" variant="outline" label="Chat with support" icon="i-lucide-messages-square" @click="openSupportChat()" />
        </div>
      </div>
      <UButton to="/issues" variant="link" color="neutral" label="Back to public issues" icon="i-lucide-arrow-left" />
    </div>
    <ReuseForm v-else />
  </div>
</template>
