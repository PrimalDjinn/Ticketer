<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

/** Admin settings: shared panel and tab bar; each tab is a child page under pages/settings/. */
definePageMeta({ middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'Settings · Ticketer' })

const tabs: NavigationMenuItem[] = [
  { label: 'Overview', icon: 'i-lucide-settings', to: '/settings', exact: true },
  { label: 'Email', icon: 'i-lucide-mail', to: '/settings/email' },
  { label: 'Sign-in', icon: 'i-lucide-key-round', to: '/settings/sign-in' },
  { label: 'Reminders', icon: 'i-lucide-alarm-clock', to: '/settings/reminders' },
  { label: 'Integrations', icon: 'i-lucide-plug', to: '/settings/integrations' },
]
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <AppNavbar title="Settings" />
      <UDashboardToolbar>
        <UNavigationMenu :items="tabs" highlight class="-mx-1 flex-1 overflow-x-auto" />
      </UDashboardToolbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
