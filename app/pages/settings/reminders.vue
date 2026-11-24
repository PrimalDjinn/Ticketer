<script setup lang="ts">
/** Settings → Reminders: when due-date reminders go out. */
definePageMeta({ middleware: ['auth', 'admin'] })

interface ReminderSettingsView {
  enabled: boolean
  hour: number
  timeZone: string
  siteOrigin: string | null
}

const toast = useToast()
const { data, refresh } = await useFetch<ReminderSettingsView>('/api/settings/reminders')

const state = reactive({ enabled: true, hour: 8, timeZone: 'UTC' })
watch(
  data,
  (value) => {
    if (value) Object.assign(state, { enabled: value.enabled, hour: value.hour, timeZone: value.timeZone })
  },
  { immediate: true },
)

const hours = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))
const timeZones = Intl.supportedValuesOf('timeZone')
if (!timeZones.includes('UTC')) timeZones.unshift('UTC')

// Offer the admin's own time zone while the setting is still on the default.
const browserZone = ref<string | null>(null)
onMounted(() => {
  browserZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone
})

const changed = computed(() => !!data.value && (data.value.enabled !== state.enabled || data.value.hour !== state.hour || data.value.timeZone !== state.timeZone))

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/settings/reminders', { method: 'PUT', body: { enabled: state.enabled, hour: state.hour, timeZone: state.timeZone } })
    toast.add({ title: 'Reminder settings saved', color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save'), color: 'error' })
  } finally {
    saving.value = false
  }
}

const running = ref(false)
async function runNow() {
  running.value = true
  try {
    const result = await $fetch<{ skipped?: string; tasks: number; people: number }>('/api/settings/reminders/run', { method: 'POST' })
    if (result.skipped === 'disabled') toast.add({ title: 'Reminders are off', color: 'warning' })
    else if (!result.tasks) toast.add({ title: 'Nothing to send', description: 'Every task due today or tomorrow has had its reminder.', icon: 'i-lucide-check' })
    else toast.add({ title: `Sent ${result.tasks} ${result.tasks === 1 ? 'reminder' : 'reminders'} to ${result.people} ${result.people === 1 ? 'person' : 'people'}`, color: 'success' })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not send reminders'), color: 'error' })
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div v-if="data" class="space-y-8">
    <div>
      <h1 class="text-lg font-semibold text-highlighted">Due-date reminders</h1>
      <p class="text-sm text-muted">
        Once a day, people are reminded about open tasks due tomorrow, and about tasks due today if the due date was set after the last reminder.
        Each due date is reminded about once.
      </p>
    </div>

    <section class="space-y-4">
      <div class="flex items-start justify-between gap-4 rounded-lg border border-default px-4 py-3">
        <div>
          <p class="text-sm font-medium text-highlighted">Send reminders</p>
          <p class="text-sm text-muted">To the assignee, or to the task's followers when nobody is assigned. Each person can turn them off in Account.</p>
        </div>
        <USwitch v-model="state.enabled" aria-label="Send reminders" />
      </div>

      <fieldset :disabled="!state.enabled" class="grid gap-4 disabled:opacity-60 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <UFormField label="Time" name="hour">
          <USelect v-model="state.hour" :items="hours" class="w-full" />
        </UFormField>
        <UFormField label="Time zone" name="timeZone" help="Also decides when “today” and “tomorrow” start.">
          <USelectMenu v-model="state.timeZone" :items="timeZones" class="w-full" :search-input="{ placeholder: 'Search time zones' }" />
        </UFormField>
      </fieldset>
      <p v-if="browserZone && browserZone !== state.timeZone && state.enabled" class="text-sm text-muted">
        You're in {{ browserZone }}.
        <UButton variant="link" :padded="false" :label="`Use ${browserZone}`" class="p-0" @click="state.timeZone = browserZone!" />
      </p>

      <div class="flex justify-end">
        <UButton label="Save" :loading="saving" :disabled="!changed" @click="save" />
      </div>
    </section>

    <UAlert
      v-if="!data.siteOrigin"
      color="warning"
      variant="subtle"
      icon="i-lucide-globe"
      title="The site address isn't known yet"
      description="Reminder emails need a link back here. It's picked up the next time someone in the team opens Ticketer, or set NUXT_SITE_URL."
    />

    <section class="space-y-3 rounded-lg border border-default p-4">
      <div>
        <h2 class="text-sm font-semibold text-highlighted">Send now</h2>
        <p class="text-sm text-muted">Sends the reminders that are due without waiting for {{ hours[state.hour]?.label }}. Tasks already reminded about are skipped.</p>
      </div>
      <UButton label="Send due reminders now" icon="i-lucide-send" color="neutral" variant="outline" :loading="running" :disabled="!data.enabled" @click="runNow" />
    </section>
  </div>
</template>
