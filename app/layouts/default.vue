<script setup lang="ts">
import type { NavigationMenuItem, DropdownMenuItem } from '@nuxt/ui'

const { user, clear } = useUserSession()
useNotificationFeed()
const notificationsOpen = useState('notifications-open', () => false)
const colorMode = useColorMode()

const links = computed<NavigationMenuItem[]>(() => [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/', exact: true },
  { label: user.value?.isAdmin ? 'All tickets' : 'My tickets', icon: 'i-lucide-ticket', to: '/tickets', exact: true },
  { label: 'New ticket', icon: 'i-lucide-square-pen', to: '/tickets/new' },
  ...(user.value?.isAdmin ? [{ label: 'Users', icon: 'i-lucide-users', to: '/users' }] : []),
])

const accountItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.email ?? '' }],
  [
    {
      label: colorMode.value === 'dark' ? 'Light mode' : 'Dark mode',
      icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => (colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'),
    },
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: signOut }],
])

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/auth/login')
}

</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar collapsible resizable class="bg-elevated/25" :ui="{ footer: 'lg:border-t lg:border-default' }">
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-2 px-1 font-semibold text-highlighted">
          <span class="grid size-8 place-items-center rounded-lg bg-primary text-inverted">
            <UIcon name="i-lucide-ticket-check" class="size-5" />
          </span>
          <span v-if="!collapsed" class="text-lg tracking-tight">Ticketer</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="links" orientation="vertical" tooltip />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="accountItems" :content="{ align: 'center', collisionPadding: 12 }" :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }">
          <UButton
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            class="data-[state=open]:bg-elevated"
            :avatar="{ text: initials(user?.name ?? '?'), size: 'sm' }"
            :label="collapsed ? undefined : user?.name"
            :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />

    <USlideover v-model:open="notificationsOpen" title="Notifications" description="Mentions, replies and ticket updates">
      <template #body>
        <NotificationList @navigate="notificationsOpen = false" />
      </template>
    </USlideover>


    <ChatWidget />
  </UDashboardGroup>
</template>

