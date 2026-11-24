<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

/**
 * Right pane of the support inbox: who the customer is, assignment, close/reopen, ticket hand-off, the thread and a
 * composer with Reply / Internal note. Loads itself and follows realtime for its conversation.
 */
const props = defineProps<{ id: number; staff: PublicUser[] }>()
const emit = defineEmits<{ back: []; changed: [conversation: ConversationDTO] }>()

const { user, staff: canAct } = useAccess()
const toast = useToast()
const detail = ref<ConversationDetailDTO | null>(null)
const failed = ref(false)
const busy = ref<'assign' | 'status' | 'ticket' | null>(null)
const scroller = useTemplateRef<HTMLElement>('scroller')

async function load() {
  failed.value = false
  try {
    detail.value = await $fetch<ConversationDetailDTO>(`/api/conversations/${props.id}`)
    markRead()
  } catch {
    detail.value = null
    failed.value = true
  }
}

function scrollDown(smooth = false) {
  nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }))
}

async function markRead() {
  if (!detail.value || document.visibilityState !== 'visible') return
  const hadUnread = detail.value.unread > 0
  detail.value.unread = 0
  if (hadUnread) emit('changed', { ...detail.value })
  await $fetch(`/api/conversations/${props.id}/read`, { method: 'POST' }).catch(() => {})
}

watch(() => props.id, () => {
  detail.value = null
  load().then(() => scrollDown())
}, { immediate: true })
onRealtimeResync(load)
if (import.meta.client) useEventListener(document, 'visibilitychange', () => document.visibilityState === 'visible' && detail.value?.unread && markRead())

onRealtime('conversation.message', (message) => {
  if (!detail.value || message.conversationId !== props.id) return
  if (detail.value.messages.some((m) => m.id === message.id)) return
  const atBottom = !scroller.value || scroller.value.scrollHeight - scroller.value.scrollTop - scroller.value.clientHeight < 120
  detail.value.messages.push(message)
  if (atBottom || message.authorId === user.value?.id) scrollDown(true)
  if (!message.fromTeam) {
    detail.value.unread += 1
    markRead()
  }
})
onRealtime('conversation.updated', (conversation) => {
  if (!detail.value || conversation.id !== props.id) return
  const { unread: _u, ...rest } = conversation
  Object.assign(detail.value, rest)
})
onRealtime('conversation.read', ({ conversationId, userId, readAt }) => {
  if (detail.value && conversationId === props.id && userId === detail.value.customer.id) detail.value.customerReadAt = readAt
})

async function patch(body: { status?: ConversationStatus; assigneeId?: string | null }, kind: 'assign' | 'status') {
  if (!detail.value) return
  busy.value = kind
  try {
    const updated = await $fetch<ConversationDTO>(`/api/conversations/${props.id}`, { method: 'PATCH', body })
    const { unread: _u, ...rest } = updated
    Object.assign(detail.value, rest)
    emit('changed', updated)
    if (body.status) toast.add({ title: body.status === 'closed' ? 'Conversation closed' : 'Conversation reopened', icon: body.status === 'closed' ? 'i-lucide-circle-check' : 'i-lucide-rotate-ccw', color: 'success' })
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e) })
  } finally {
    busy.value = null
  }
}

async function createTicket() {
  busy.value = 'ticket'
  try {
    const result = await $fetch<{ ticket: TicketDTO; conversation: ConversationDTO; message: ConversationMessageDTO | null }>(`/api/conversations/${props.id}/ticket`, { method: 'POST' })
    if (detail.value) {
      detail.value.ticketId = result.ticket.id
      if (result.message && !detail.value.messages.some((m) => m.id === result.message!.id)) detail.value.messages.push(result.message)
      scrollDown(true)
    }
    emit('changed', result.conversation)
    toast.add({ title: 'Ticket created', description: result.ticket.title, color: 'success', icon: 'i-lucide-life-buoy', actions: [{ label: 'Open', to: `/tickets/${result.ticket.id}`, variant: 'outline' }] })
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not create the ticket') })
  } finally {
    busy.value = null
  }
}

async function send(input: { body: string; files: File[]; internal: boolean }) {
  const form = new FormData()
  form.set('body', input.body.trim())
  if (input.internal) form.set('internal', 'true')
  for (const file of input.files) form.append('files', file)
  const message = await $fetch<ConversationMessageDTO>(`/api/conversations/${props.id}/messages`, { method: 'POST', body: form })
  if (detail.value && !detail.value.messages.some((m) => m.id === message.id)) detail.value.messages.push(message)
  scrollDown(true)
}

const assigneeItems = computed(() => [
  { label: 'Unassigned', value: null, icon: 'i-lucide-circle-dashed' },
  ...props.staff.map((p) => ({ label: p.id === user.value?.id ? `${p.name} (you)` : p.name, value: p.id, avatar: { text: initials(p.name) } })),
])
const customerLink = computed(() => (detail.value ? `/tickets?q=${encodeURIComponent(detail.value.customer.email ?? detail.value.customer.name)}` : '/tickets'))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div v-if="failed" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <UIcon name="i-lucide-message-circle-off" class="size-10 text-dimmed" />
      <p class="text-sm text-muted">This conversation does not exist or was removed.</p>
      <UButton color="neutral" variant="outline" label="Back to inbox" @click="emit('back')" />
    </div>
    <div v-else-if="!detail" class="flex flex-1 items-center justify-center">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
    </div>
    <template v-else>
      <!-- Header -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-default px-3 py-2.5 sm:px-4">
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" class="lg:hidden" aria-label="Back to inbox" @click="emit('back')" />
        <UAvatar :text="initials(detail.customer.name)" size="md" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <p class="truncate font-semibold text-highlighted">{{ detail.customer.name }}</p>
            <UBadge :label="detail.customer.isGuest ? 'Guest' : 'External'" size="sm" :color="detail.customer.isGuest ? 'neutral' : 'info'" variant="subtle" class="shrink-0" />
            <UBadge v-if="detail.status === 'closed'" label="Closed" size="sm" color="neutral" variant="outline" class="shrink-0" />
          </div>
          <p class="flex items-center gap-2 truncate text-xs text-muted">
            <span class="truncate">{{ detail.customer.email ?? 'No email (guest session)' }}</span>
            <span aria-hidden="true">·</span>
            <NuxtLink :to="customerLink" class="shrink-0 hover:text-highlighted hover:underline">Their tickets</NuxtLink>
          </p>
        </div>
        <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <template v-if="canAct">
            <USelectMenu
              :model-value="detail.assigneeId"
              :items="assigneeItems"
              value-key="value"
              :search-input="{ placeholder: 'Find a teammate…' }"
              :loading="busy === 'assign'"
              size="sm"
              class="w-40"
              aria-label="Assignee"
              @update:model-value="(v: string | null) => patch({ assigneeId: v }, 'assign')"
            />
            <UButton
              v-if="detail.assigneeId !== user?.id"
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-hand"
              label="Assign to me"
              :loading="busy === 'assign'"
              @click="patch({ assigneeId: user!.id }, 'assign')"
            />
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :icon="detail.status === 'open' ? 'i-lucide-circle-check' : 'i-lucide-rotate-ccw'"
              :label="detail.status === 'open' ? 'Close' : 'Reopen'"
              :loading="busy === 'status'"
              @click="patch({ status: detail.status === 'open' ? 'closed' : 'open' }, 'status')"
            />
            <UButton v-if="detail.ticketId" size="sm" color="info" variant="soft" icon="i-lucide-life-buoy" label="View ticket" :to="`/tickets/${detail.ticketId}`" />
            <UButton v-else size="sm" icon="i-lucide-life-buoy" label="Create ticket" :loading="busy === 'ticket'" @click="createTicket" />
          </template>
          <template v-else>
            <span class="flex items-center gap-1.5 text-xs text-muted">
              <UAvatar v-if="detail.assigneeName" :text="initials(detail.assigneeName)" size="3xs" />
              {{ detail.assigneeName ? `Assigned to ${detail.assigneeName}` : 'Unassigned' }}
            </span>
            <UButton v-if="detail.ticketId" size="sm" color="info" variant="soft" icon="i-lucide-life-buoy" label="View ticket" :to="`/tickets/${detail.ticketId}`" />
          </template>
        </div>
      </div>

      <!-- Thread -->
      <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto bg-elevated/25 px-3 py-4 sm:px-6">
        <p v-if="detail.subject" class="mb-3 text-center text-xs text-muted">
          Subject: <span class="font-medium text-default">{{ detail.subject }}</span>
        </p>
        <ConversationThread :messages="detail.messages" side="team" :seen-at="detail.customerReadAt" />
      </div>

      <!-- Composer -->
      <div class="border-t border-default p-3 sm:px-6">
        <ConversationComposer
          v-if="canAct"
          :key="detail.id"
          :send="send"
          allow-internal
          :audience="detail.customer.name"
          :placeholder="detail.status === 'closed' ? 'Reply (the conversation stays closed)…' : `Reply to ${detail.customer.name}…`"
        />
        <p v-else class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-eye" class="size-4" />
          You can read support conversations; admins and members reply.
        </p>
      </div>
    </template>
  </div>
</template>
