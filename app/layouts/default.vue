<script setup lang="ts">
import type { NavigationMenuItem, DropdownMenuItem } from '@nuxt/ui'

const { user, clear } = useUserSession()
const { items: notifications } = useNotificationFeed()
const notificationsOpen = useState('notifications-open', () => false)
const colorMode = useColorMode()
const { active: projects, refresh: refreshProjects } = useProjects()
useProjectsFeed()
await refreshProjects()
const newProjectOpen = ref(false)
const canEdit = computed(() => user.value?.role === 'admin' || user.value?.role === 'member')

const workLinks = computed<NavigationMenuItem[]>(() => [
  { label: 'Home', icon: 'i-lucide-house', to: '/', exact: true },
  {
    label: 'Inbox',
    icon: 'i-lucide-inbox',
    badge: notifications.value.length ? String(notifications.value.length) : undefined,
    onSelect: () => (notificationsOpen.value = true),
  },
  { label: 'My tasks', icon: 'i-lucide-circle-check-big', to: '/my-tasks' },
])

const supportLinks = computed<NavigationMenuItem[]>(() => [
  { label: user.value?.isAdmin ? 'Tickets' : 'My tickets', icon: 'i-lucide-life-buoy', to: '/tickets', exact: true },
  { label: 'New ticket', icon: 'i-lucide-square-pen', to: '/tickets/new' },
  ...(user.value?.isAdmin ? [{ label: 'Members', icon: 'i-lucide-users', to: '/users' }] : []),
])

const projectLinks = computed<NavigationMenuItem[]>(() =>
  projects.value.map((p) => ({
    label: p.name,
    to: `/projects/${p.key}`,
    badge: p.openCount ? String(p.openCount) : undefined,
    slot: 'project' as const,
    project: p,
  })),
)

// Command palette (Ctrl/Cmd+K)
const searchGroups = computed(() => [
  {
    id: 'go',
    label: 'Go to',
    items: [
      { label: 'Home', icon: 'i-lucide-house', to: '/' },
      { label: 'My tasks', icon: 'i-lucide-circle-check-big', to: '/my-tasks' },
      { label: 'Tickets', icon: 'i-lucide-life-buoy', to: '/tickets' },
      { label: 'All projects', icon: 'i-lucide-folder-kanban', to: '/projects' },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    items: projects.value.map((p) => ({ label: p.name, suffix: p.key, icon: 'i-lucide-folder', to: `/projects/${p.key}` })),
  },
  {
    id: 'actions',
    label: 'Actions',
    items: [
      { label: 'New ticket', icon: 'i-lucide-square-pen', to: '/tickets/new' },
      ...(canEdit.value ? [{ label: 'New project', icon: 'i-lucide-folder-plus', onSelect: () => (newProjectOpen.value = true) }] : []),
    ],
  },
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
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />
        <UNavigationMenu :collapsed="collapsed" :items="workLinks" orientation="vertical" tooltip />

        <div class="mt-2 flex items-center justify-between px-2.5" :class="collapsed && 'justify-center'">
          <NuxtLink v-if="!collapsed" to="/projects" class="text-xs font-medium text-dimmed hover:text-muted">Projects</NuxtLink>
          <UTooltip v-if="canEdit" text="New project">
            <UButton icon="i-lucide-plus" size="xs" color="neutral" variant="ghost" aria-label="New project" @click="newProjectOpen = true" />
          </UTooltip>
        </div>
        <UNavigationMenu :collapsed="collapsed" :items="projectLinks" orientation="vertical" tooltip>
          <template #project-leading="{ item }">
            <span class="grid size-5 shrink-0 place-items-center">
              <span class="size-2.5 rounded-sm" :class="color((item as { project: ProjectDTO }).project.color).dot" />
            </span>
          </template>
        </UNavigationMenu>
        <p v-if="!projects.length && !collapsed" class="px-2.5 text-xs text-dimmed">No projects yet</p>

        <p v-if="!collapsed" class="mt-2 px-2.5 text-xs font-medium text-dimmed">Support</p>
        <UNavigationMenu :collapsed="collapsed" :items="supportLinks" orientation="vertical" tooltip />
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

    <UDashboardSearch :groups="searchGroups" placeholder="Search projects, pages and actions…" />
    <NewProjectModal v-model:open="newProjectOpen" />
    <ChatWidget />
  </UDashboardGroup>
</template>

