<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'New ticket · Ticketer' })

const toast = useToast()
const info = ref('')
const urgency = ref<TicketUrgency>('Default')
const files = ref<File[]>([])
const loading = ref(false)

const urgencyOptions = [
  { value: 'Default', label: 'Normal', description: 'We will get to it in order' },
  { value: 'Urgent', label: 'Urgent', description: 'Blocking your work' },
  { value: 'Emergency', label: 'Emergency', description: 'Something is down for everyone' },
]

async function submit() {
  if (!info.value.trim()) return
  const oversized = files.value.find((f) => f.size > UPLOAD_LIMITS.maxBytes)
  if (oversized) {
    toast.add({ color: 'error', title: `${oversized.name} is larger than ${UPLOAD_LIMITS.maxSize}` })
    return
  }
  loading.value = true
  try {
    const form = new FormData()
    form.set('info', info.value.trim())
    form.set('urgency', urgency.value)
    for (const file of files.value.slice(0, UPLOAD_LIMITS.maxFiles)) form.append('files', file)
    const ticket = await $fetch<TicketDTO>('/api/tickets', { method: 'POST', body: form })
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
  <UDashboardPanel id="new-ticket">
    <template #header>
      <AppNavbar title="New ticket" />
    </template>

    <template #body>
      <form class="mx-auto w-full max-w-2xl space-y-6" @submit.prevent="submit">
        <div>
          <h1 class="text-xl font-semibold text-highlighted">What's going on?</h1>
          <p class="mt-1 text-sm text-muted">Include what you expected, what happened instead, and any transaction codes.</p>
        </div>

        <UFormField label="Description" required>
          <UTextarea v-model="info" :rows="7" autoresize placeholder="Describe the problem…" class="w-full" autofocus :maxlength="10000" />
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

        <div class="flex justify-end gap-2 border-t border-default pt-6">
          <UButton to="/" color="neutral" variant="ghost" label="Cancel" />
          <UButton type="submit" :loading="loading" :disabled="!info.trim()" icon="i-lucide-send" label="Open ticket" />
        </div>
      </form>
    </template>
  </UDashboardPanel>
</template>
