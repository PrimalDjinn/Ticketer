<script setup lang="ts">
import type { NavigationMenuItem, DropdownMenuItem } from '@nuxt/ui'

const { clear } = useUserSession()
const { user, internal, staff: canEdit, admin } = useAccess()
const { items: notifications } = useNotificationFeed()
const notificationsOpen = useState('notifications-open', () => false)
const colorMode = useColorMode()
const { active: projects, refresh: refreshProjects } = useProjects()
useProjectsFeed()
await refreshProjects()
const newProjectOpen = ref(false)
// Open/unread support conversations for the sidebar badge (team only; kept live by the composable).
const { stats: inbox } = useSupportInbox()

const notificationsLink = computed<NavigationMenuItem>(() => ({
  label: 'Notifications',
  icon: 'i-lucide-bell',
  badge: notifications.value.length ? String(notifications.value.length) : undefined,
  onSelect: () => (notificationsOpen.value = true),
}))

const workLinks = computed<NavigationMenuItem[]>(() =>
  internal.value
    ? [{ label: 'Home', icon: 'i-lucide-house', to: '/', exact: true }, notificationsLink.value, { label: 'My tasks', icon: 'i-lucide-circle-check-big', to: '/my-tasks' }]
    : [{ label: 'Home', icon: 'i-lucide-house', to: '/', exact: true }, notificationsLink.value],
)

const supportLinks = computed<NavigationMenuItem[]>(() =>
  internal.value
    ? [
        {
          label: 'Conversations',
          icon: 'i-lucide-messages-square',
          to: '/conversations',
          badge: inbox.value.unread ? { label: String(inbox.value.unread), color: 'primary' as const, variant: 'solid' as const } : inbox.value.open ? String(inbox.value.open) : undefined,
        },
        { label: 'Tickets', icon: 'i-lucide-life-buoy', to: '/tickets', exact: true },
        { label: 'Public issues', icon: 'i-lucide-globe', to: '/issues' },
        { label: 'New ticket', icon: 'i-lucide-square-pen', to: '/tickets/new' },
        ...(admin.value
          ? [
              { label: 'Members', icon: 'i-lucide-users', to: '/users' },
              { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
            ]
          : []),
      ]
    : [
        { label: 'My tickets', icon: 'i-lucide-life-buoy', to: '/tickets', exact: true },
        { label: 'Public issues', icon: 'i-lucide-globe', to: '/issues' },
        { label: 'New ticket', icon: 'i-lucide-square-pen', to: '/tickets/new' },
      ],
)

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
    items: internal.value
      ? [
          { label: 'Home', icon: 'i-lucide-house', to: '/' },
          { label: 'My tasks', icon: 'i-lucide-circle-check-big', to: '/my-tasks' },
          { label: 'Conversations', icon: 'i-lucide-messages-square', to: '/conversations' },
          { label: 'Tickets', icon: 'i-lucide-life-buoy', to: '/tickets' },
          { label: 'Public issues', icon: 'i-lucide-globe', to: '/issues' },
          { label: 'All projects', icon: 'i-lucide-folder-kanban', to: '/projects' },
          ...(admin.value
            ? [
                { label: 'Members', icon: 'i-lucide-users', to: '/users' },
                { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
              ]
            : []),
        ]
      : [
          { label: 'Home', icon: 'i-lucide-house', to: '/' },
          { label: 'My tickets', icon: 'i-lucide-life-buoy', to: '/tickets' },
          { label: 'Public issues', icon: 'i-lucide-globe', to: '/issues' },
        ],
  },
  ...(internal.value
    ? [
        {
          id: 'projects',
          label: 'Projects',
          items: projects.value.map((p) => ({ label: p.name, suffix: p.key, icon: 'i-lucide-folder', to: `/projects/${p.key}` })),
        },
      ]
    : []),
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
  [{ type: 'label', label: user.value?.email ?? '' }, { type: 'label', label: user.value ? roleMeta[user.value.role].label : '', icon: user.value ? roleMeta[user.value.role].icon : undefined }],
  [
    { label: 'Account', icon: 'i-lucide-user-cog', to: '/account' },
    {
      label: colorMode.value === 'dark' ? 'Light mode' : 'Dark mode',
      icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => (colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'),
    },
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: signOut }],
])

const push = usePush()
onMounted(() => push.refresh().catch(() => {}))

async function signOut() {
  // Stop push to this browser first, so the next person using it doesn't get this account's notifications.
  if (push.subscribed.value) await push.disable().catch(() => {})
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

        <template v-if="internal">
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
        </template>

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
    <USlideover v-model:open="notificationsOpen" title="Notifications" :description="internal ? 'Mentions, replies, assignments and ticket updates' : 'Replies and updates on your tickets and conversations'">
      <template #body>
        <NotificationList @navigate="notificationsOpen = false" />
      </template>
    </USlideover>

    <UDashboardSearch :groups="searchGroups" placeholder="Search projects, pages and actions…" />
    <NewProjectModal v-model:open="newProjectOpen" />
  </UDashboardGroup>
</template>

