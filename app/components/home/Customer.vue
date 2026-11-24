<script setup lang="ts">
/**
 * Home for people outside the team (external accounts): their tickets, their support conversations and the latest
 * public issues, with the two ways to get help up front.
 */
import { useDebounceFn } from '@vueuse/core'

const { user } = useAccess()
const { items: notifications } = useNotifications()

type TicketPage = { items: TicketDTO[]; total: number; page: number; pageSize: number }
const emptyPage = (): TicketPage => ({ items: [], total: 0, page: 1, pageSize: 5 })

const [{ data: mine, refresh: refreshMine }, { data: publicIssues, refresh: refreshPublic }, { data: conversationPage, refresh: refreshConversations }] = await Promise.all([
  useFetch<TicketPage>('/api/tickets', { query: { scope: 'mine', pageSize: 5 }, default: emptyPage }),
  useFetch<TicketPage>('/api/tickets', { query: { scope: 'public', pageSize: 5 }, default: emptyPage }),
  useFetch<ConversationPage>('/api/conversations', { query: { limit: 3 }, default: () => ({ items: [], total: 0, page: 1, pageSize: 3 }) }),
])
const conversations = computed(() => conversationPage.value.items)

const refreshTickets = useDebounceFn(() => Promise.all([refreshMine(), refreshPublic()]), 400)
onRealtime('ticket.created', refreshTickets)
onRealtime('ticket.updated', refreshTickets)
onRealtime('ticket.deleted', refreshTickets)
onRealtime('conversation.updated', () => refreshConversations())
onRealtime('conversation.message', () => refreshConversations())
onRealtimeResync(() => Promise.all([refreshTickets(), refreshConversations()]))

const openTickets = computed(() => mine.value.items.filter((t) => t.status === 'Open' || t.status === 'Pending').length)
const unreadReplies = computed(() => conversations.value.reduce((sum, c) => sum + c.unread, 0))

const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
})
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <AppNavbar title="Home">
        <template #right>
          <UButton to="/tickets/new" icon="i-lucide-plus" label="Report an issue" class="hidden sm:inline-flex" />
        </template>
      </AppNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-highlighted">{{ greeting }}, {{ user?.name }}</h1>
          <p class="mt-1 text-muted">
            <template v-if="unreadReplies">Support replied to you — {{ unreadReplies }} unread message{{ unreadReplies === 1 ? '' : 's' }}.</template>
            <template v-else-if="notifications.length">You have {{ notifications.length }} unread update{{ notifications.length === 1 ? '' : 's' }}.</template>
            <template v-else-if="openTickets">{{ openTickets }} of your tickets {{ openTickets === 1 ? 'is' : 'are' }} being handled.</template>
            <template v-else>How can we help today?</template>
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <NuxtLink to="/tickets/new" class="group rounded-xl bg-default p-5 ring ring-default transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/50">
            <span class="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-square-pen" class="size-5" />
            </span>
            <p class="mt-4 font-semibold text-highlighted">Report an issue</p>
            <p class="mt-1 text-sm text-muted">Describe the problem and attach screenshots. You'll get updates as it moves.</p>
          </NuxtLink>
          <button type="button" class="group rounded-xl bg-default p-5 text-left ring ring-default transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/50" @click="openSupportChat()">
            <span class="grid size-10 place-items-center rounded-lg bg-success/10 text-success">
              <UIcon name="i-lucide-messages-square" class="size-5" />
            </span>
            <p class="mt-4 font-semibold text-highlighted">Chat with support</p>
            <p class="mt-1 text-sm text-muted">Ask a quick question. Anyone on the team can pick it up.</p>
          </button>
          <NuxtLink to="/issues" class="group rounded-xl bg-default p-5 ring ring-default transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/50">
            <span class="grid size-10 place-items-center rounded-lg bg-info/10 text-info">
              <UIcon name="i-lucide-globe" class="size-5" />
            </span>
            <p class="mt-4 font-semibold text-highlighted">Public issues</p>
            <p class="mt-1 text-sm text-muted">Known problems and announcements, and what's being done about them.</p>
          </NuxtLink>
        </div>

        <div class="grid gap-6 lg:grid-cols-5">
          <UCard class="lg:col-span-3" :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">Your tickets</h2>
                <UButton to="/tickets" variant="link" color="neutral" trailing-icon="i-lucide-arrow-right" label="View all" size="sm" />
              </div>
            </template>
            <UEmpty v-if="!mine.items.length" variant="naked" icon="i-lucide-life-buoy" title="No tickets yet" description="When you report an issue it shows up here." class="py-10" />
            <ul v-else class="divide-y divide-default">
              <li v-for="ticket in mine.items" :key="ticket.id">
                <NuxtLink :to="`/tickets/${ticket.id}`" class="flex items-center gap-3 px-4 py-3 transition hover:bg-elevated/50 sm:px-6">
                  <div class="min-w-0 flex-1">
                    <p class="flex items-center gap-1.5 text-sm font-medium text-highlighted">
                      <UIcon v-if="ticket.visibility === 'public'" name="i-lucide-globe" class="size-3.5 shrink-0 text-info" aria-label="Public" />
                      <span class="truncate">{{ ticket.title }}</span>
                    </p>
                    <p class="text-xs text-muted">
                      #{{ shortRef(ticket.reference) }} · updated <NuxtTime :datetime="ticket.updatedAt ?? ticket.createdAt" relative :title="formatDateTime(ticket.updatedAt ?? ticket.createdAt)" />
                    </p>
                  </div>
                  <TicketStatusBadge :status="ticket.status" />
                </NuxtLink>
              </li>
            </ul>
          </UCard>

          <div class="space-y-6 lg:col-span-2">
            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-highlighted">Conversations</h2>
                  <UButton variant="link" color="neutral" trailing-icon="i-lucide-message-circle" label="Open chat" size="sm" @click="openSupportChat()" />
                </div>
              </template>
              <p v-if="!conversations.length" class="px-4 py-6 text-center text-sm text-muted sm:px-6">No conversations yet.</p>
              <ul v-else class="divide-y divide-default">
                <li v-for="c in conversations" :key="c.id">
                  <button type="button" class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-elevated/50 sm:px-6" @click="openSupportChat(c.id)">
                    <UChip :show="c.unread > 0" color="primary" inset>
                      <UIcon name="i-lucide-message-square" class="size-5 text-muted" />
                    </UChip>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm" :class="c.unread ? 'font-semibold text-highlighted' : 'text-default'">{{ c.subject ?? c.preview?.body ?? 'Conversation' }}</p>
                      <p class="text-xs text-muted">
                        {{ c.status === 'closed' ? 'Closed' : c.assigneeName ? `With ${c.assigneeName}` : 'Waiting for the team' }}
                        <template v-if="c.lastMessageAt"> · <NuxtTime :datetime="c.lastMessageAt" relative /></template>
                      </p>
                    </div>
                  </button>
                </li>
              </ul>
            </UCard>

            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-highlighted">Latest public issues</h2>
                  <UButton to="/issues" variant="link" color="neutral" trailing-icon="i-lucide-arrow-right" label="All" size="sm" />
                </div>
              </template>
              <p v-if="!publicIssues.items.length" class="px-4 py-6 text-center text-sm text-muted sm:px-6">Nothing reported publicly right now.</p>
              <ul v-else class="divide-y divide-default">
                <li v-for="ticket in publicIssues.items" :key="ticket.id">
                  <NuxtLink :to="`/issues/${ticket.reference}`" class="flex items-center gap-3 px-4 py-2.5 transition hover:bg-elevated/50 sm:px-6">
                    <span class="min-w-0 flex-1 truncate text-sm text-default">{{ ticket.title }}</span>
                    <TicketStatusBadge :status="ticket.status" />
                  </NuxtLink>
                </li>
              </ul>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
