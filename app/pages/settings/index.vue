<script setup lang="ts">
/** Settings overview: the state of each area at a glance, with a link to change it. */
definePageMeta({ middleware: ['auth', 'admin'] })

type Mail = { transport: 'cloudflare' | 'smtp' | 'none'; from: { value: string } }
const [{ data: mail }, { data: providers }, { data: settings }, { data: reminders }] = await Promise.all([
  useFetch<Mail>('/api/settings/mail'),
  useFetch<{ password: boolean; oidc: { name: string } | null }>('/api/auth/providers'),
  useFetch<{ signup: SignupMode }>('/api/settings'),
  useFetch<{ enabled: boolean; hour: number; timeZone: string }>('/api/settings/reminders'),
])

const signupLabel: Record<SignupMode, string> = {
  invite: 'Invitation only',
  external: 'Anyone can sign up as external',
  viewer: 'Anyone can sign up as a viewer',
  member: 'Anyone can sign up as a member',
}

const rows = computed(() => [
  {
    icon: 'i-lucide-mail',
    title: 'Email',
    to: '/settings/email',
    ok: !!mail.value && mail.value.transport !== 'none' && !!mail.value.from.value,
    status: !mail.value
      ? 'Unknown'
      : mail.value.transport === 'none' || !mail.value.from.value
        ? 'Not set up — invitations and password resets are only logged'
        : `${mail.value.transport === 'cloudflare' ? 'Cloudflare Email Sending' : 'SMTP'} · from ${mail.value.from.value}`,
  },
  {
    icon: 'i-lucide-key-round',
    title: 'Sign-in',
    to: '/settings/sign-in',
    ok: !!providers.value?.oidc,
    status: providers.value?.oidc
      ? `${providers.value.oidc.name}${providers.value.password ? ' and passwords' : ' only'}`
      : 'Email and password',
  },
  {
    icon: 'i-lucide-door-open',
    title: 'Who can sign up',
    to: '/users',
    ok: true,
    status: settings.value ? signupLabel[settings.value.signup] : 'Unknown',
  },
  {
    icon: 'i-lucide-alarm-clock',
    title: 'Due-date reminders',
    to: '/settings/reminders',
    ok: true,
    status: !reminders.value
      ? 'Unknown'
      : reminders.value.enabled
        ? `Every day at ${String(reminders.value.hour).padStart(2, '0')}:00 (${reminders.value.timeZone})`
        : 'Off',
  },
  {
    icon: 'i-lucide-plug',
    title: 'Integrations',
    to: '/settings/integrations',
    ok: true,
    status: 'Let other apps send their users here',
  },
])
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-lg font-semibold text-highlighted">Overview</h1>
      <p class="text-sm text-muted">Settings saved here apply right away. Values set through environment variables take precedence and are shown as locked.</p>
    </div>
    <ul class="divide-y divide-default rounded-lg border border-default">
      <li v-for="row in rows" :key="row.title">
        <NuxtLink :to="row.to" class="flex items-center gap-4 px-4 py-3.5 transition hover:bg-elevated/50">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-elevated">
            <UIcon :name="row.icon" class="size-5 text-muted" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-highlighted">{{ row.title }}</p>
            <p class="truncate text-sm" :class="row.ok ? 'text-muted' : 'text-warning'">{{ row.status }}</p>
          </div>
          <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
