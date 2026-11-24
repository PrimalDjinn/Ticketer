<script setup lang="ts">
/** Customer side of the chat widget: the current thread, a start screen and the list of past conversations. */
const props = defineProps<{ chat: SupportChat }>()
const view = defineModel<'thread' | 'new' | 'list'>('view', { required: true })
const { registered } = useAccess()

const subject = ref('')
const scroller = useTemplateRef<HTMLElement>('scroller')
const active = computed(() => props.chat.active.value)

function scrollDown(smooth = true) {
  nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }))
}
watch(() => [active.value?.id, active.value?.messages.length, view.value, active.value?.ticketId, active.value?.status], (now, before) => scrollDown(now[0] === before?.[0]), { immediate: true })

async function start(input: { body: string; files: File[] }) {
  await props.chat.start({ subject: subject.value, ...input })
  subject.value = ''
  view.value = 'thread'
}

async function pick(conversation: ConversationDTO) {
  view.value = 'thread'
  await props.chat.open(conversation.id)
}

function preview(c: ConversationDTO) {
  if (!c.preview) return 'No messages yet'
  return `${c.preview.fromTeam ? `${c.preview.authorName}: ` : 'You: '}${c.preview.body}`
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Thread -->
    <template v-if="view === 'thread' && active">
      <div class="flex items-center gap-2 border-b border-default px-3 py-2">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">{{ active.subject || 'Conversation with support' }}</p>
          <p class="flex items-center gap-1.5 text-xs text-muted">
            <span class="size-1.5 rounded-full" :class="active.status === 'open' ? 'bg-success' : 'bg-dimmed'" />
            {{ active.status === 'open' ? (active.assigneeName ? `${active.assigneeName} is helping you` : 'The team will reply here') : 'Closed' }}
          </p>
        </div>
      </div>
      <div ref="scroller" class="flex-1 overflow-y-auto bg-elevated/30 px-3 py-3">
        <ConversationThread :messages="active.messages" side="customer" :seen-at="active.teamReadAt" compact />
      </div>
      <div v-if="active.ticketId" class="flex items-center gap-2 border-t border-default bg-info/5 px-3 py-2 text-xs">
        <UIcon name="i-lucide-life-buoy" class="size-4 shrink-0 text-info" />
        <span class="flex-1 text-default">The team is tracking this as a ticket.</span>
        <UButton v-if="registered" :to="`/tickets/${active.ticketId}`" size="xs" color="info" variant="soft" label="View ticket" trailing-icon="i-lucide-arrow-right" />
      </div>
      <p v-if="active.status === 'closed'" class="border-t border-default px-3 py-2 text-xs text-muted">This conversation is closed. Write again to reopen it.</p>
      <div class="border-t border-default p-2">
        <ConversationComposer :send="chat.send" compact autofocus />
      </div>
    </template>

    <div v-else-if="view === 'thread' && chat.loadingThread.value" class="flex flex-1 items-center justify-center">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
    </div>

    <!-- Past conversations -->
    <template v-else-if="view === 'list'">
      <div class="flex-1 overflow-y-auto">
        <UEmpty v-if="!chat.sorted.value.length" icon="i-lucide-message-circle-off" title="No conversations yet" class="py-10" />
        <button
          v-for="c in chat.sorted.value"
          :key="c.id"
          type="button"
          class="flex w-full items-start gap-3 border-b border-default px-4 py-3 text-left transition hover:bg-elevated/60"
          @click="pick(c)"
        >
          <UIcon :name="c.status === 'open' ? 'i-lucide-message-circle' : 'i-lucide-message-circle-off'" class="mt-0.5 size-4 shrink-0" :class="c.status === 'open' ? 'text-primary' : 'text-dimmed'" />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between gap-2">
              <p class="truncate text-sm font-medium text-highlighted">{{ c.subject || 'Conversation with support' }}</p>
              <span class="shrink-0 text-[11px] text-dimmed"><NuxtTime :datetime="c.lastMessageAt ?? c.createdAt" relative /></span>
            </div>
            <p class="truncate text-xs" :class="c.unread ? 'font-medium text-highlighted' : 'text-muted'">{{ preview(c) }}</p>
          </div>
          <UBadge v-if="c.unread" :label="String(c.unread)" size="sm" class="rounded-full" />
          <UBadge v-else-if="c.ticketId" label="Ticket" size="sm" color="info" variant="subtle" />
        </button>
      </div>
      <div class="border-t border-default p-2">
        <UButton block icon="i-lucide-plus" label="New conversation" @click="view = 'new'" />
      </div>
    </template>

    <!-- Start -->
    <template v-else>
      <div class="flex flex-1 flex-col justify-center gap-2 overflow-y-auto px-5 py-6 text-center">
        <UIcon name="i-lucide-life-buoy" class="mx-auto size-10 text-primary" />
        <p class="font-medium text-highlighted">How can we help?</p>
        <p class="text-sm text-muted">
          Send us a message and the support team will reply right here.
          <template v-if="!chat.user.value">No account needed.</template>
        </p>
        <button v-if="chat.sorted.value.length" type="button" class="mx-auto text-xs text-primary hover:underline" @click="view = 'list'">
          See your {{ chat.sorted.value.length === 1 ? 'earlier conversation' : `${chat.sorted.value.length} conversations` }}
        </button>
      </div>
      <div class="space-y-2 border-t border-default p-2">
        <UInput v-model="subject" placeholder="Subject (optional)" variant="outline" size="sm" class="w-full" :maxlength="200" aria-label="Subject" />
        <ConversationComposer :send="start" compact autofocus placeholder="Describe what you need…" />
      </div>
    </template>
  </div>
</template>
