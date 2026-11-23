<script setup lang="ts">
/**
 * Floating support chat. Anyone can open it; a visitor without an account gets a guest session on their first
 * message, and keeps the conversation if they register later.
 */
const { user, fetch: refreshSession } = useUserSession()
const toast = useToast()
/** `floating`: round button in the corner (sign-in pages). `inline`: icon button for the app's top bar. */
const props = withDefaults(defineProps<{ variant?: 'floating' | 'inline' }>(), { variant: 'floating' })
const open = ref(false)
const chats = ref<ChatDTO[]>([])
const activeId = ref<string | null>(null)
const draft = ref('')
const files = ref<File[]>([])
const sending = ref(false)
const loaded = ref(false)
const scroller = useTemplateRef<HTMLElement>('scroller')

const active = computed(() => chats.value.find((c) => c.id === activeId.value) ?? null)
const unread = (chat: ChatDTO) => chat.messages.filter((m) => m.toId === user.value?.id && !m.readAt).length
const totalUnread = computed(() => chats.value.reduce((sum, c) => sum + unread(c), 0))
const sorted = computed(() =>
  [...chats.value].sort((a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()),
)

async function load() {
  if (!user.value) {
    // Visitors without any session see support people from a public-safe list once they start a guest session.
    chats.value = []
    loaded.value = true
    return
  }
  chats.value = await $fetch<ChatDTO[]>('/api/chats').catch(() => [])
  loaded.value = true
}

watch(() => user.value?.id, load, { immediate: import.meta.client })
onRealtimeResync(load)

onRealtime('message.created', (message) => {
  const chat = chats.value.find((c) => c.id === message.chatId)
  if (!chat) return load()
  if (!chat.messages.some((m) => m.id === message.id)) chat.messages.push(message)
  chat.lastMessageAt = message.createdAt
  if (open.value && activeId.value === chat.id) markRead(chat)
  else if (message.toId === user.value?.id) new Audio('/notification.mp3').play().catch(() => {})
  scrollDown()
})
onRealtime('messages.read', ({ chatId }) => {
  const chat = chats.value.find((c) => c.id === chatId)
  const now = new Date().toISOString()
  chat?.messages.forEach((m) => m.fromId === user.value?.id && !m.readAt && (m.readAt = now))
})

async function startGuest() {
  await $fetch('/api/auth/guest', { method: 'POST' })
  await refreshSession()
  await load()
}

function select(chat: ChatDTO) {
  activeId.value = chat.id
  markRead(chat)
  scrollDown()
}

async function markRead(chat: ChatDTO) {
  if (!unread(chat)) return
  const now = new Date().toISOString()
  chat.messages.forEach((m) => m.toId === user.value?.id && !m.readAt && (m.readAt = now))
  await $fetch(`/api/chats/${encodeURIComponent(chat.id)}/read`, { method: 'POST' }).catch(() => {})
}

function scrollDown() {
  nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' }))
}

async function send() {
  if (!active.value || sending.value || (!draft.value.trim() && !files.value.length)) return
  sending.value = true
  try {
    const form = new FormData()
    form.set('to', active.value.with.id)
    form.set('body', draft.value.trim())
    for (const file of files.value) form.append('files', file)
    const message = await $fetch<MessageDTO>('/api/chats/messages', { method: 'POST', body: form })
    if (!active.value.messages.some((m) => m.id === message.id)) active.value.messages.push(message)
    active.value.lastMessageAt = message.createdAt
    draft.value = ''
    files.value = []
    scrollDown()
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Message not sent') })
  } finally {
    sending.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
  }
}

function preview(chat: ChatDTO) {
  const last = chat.messages.at(-1)
  if (!last) return 'Start a conversation'
  if (last.body) return last.body
  return last.attachments.length === 1 ? last.attachments[0]!.name : `${last.attachments.length} files`
}
</script>

<template>
  <div :class="props.variant === 'floating' ? 'fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6' : 'contents'">
    <UPopover
      v-model:open="open"
      :content="props.variant === 'floating' ? { side: 'top', align: 'end', sideOffset: 12 } : { side: 'bottom', align: 'end', sideOffset: 8 }"
      :ui="{ content: 'w-[calc(100vw-2rem)] sm:w-96 p-0 overflow-hidden' }"
    >
      <UChip v-if="props.variant === 'floating'" :show="totalUnread > 0" :text="totalUnread" color="error" size="3xl">
        <UButton size="xl" class="rounded-full shadow-lg" :icon="open ? 'i-lucide-x' : 'i-lucide-message-circle'" aria-label="Support chat" />
      </UChip>
      <UTooltip v-else text="Messages">
        <UButton color="neutral" variant="ghost" square aria-label="Messages">
          <UChip :show="totalUnread > 0" color="error" inset>
            <UIcon name="i-lucide-message-circle" class="size-5 shrink-0" />
          </UChip>
        </UButton>
      </UTooltip>

      <template #content>
        <div class="flex h-[min(32rem,70vh)] flex-col">
          <!-- Conversation -->
          <template v-if="active">
            <div class="flex items-center gap-3 border-b border-default px-3 py-2.5">
              <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" aria-label="Back to conversations" @click="activeId = null" />
              <UAvatar :text="initials(active.with.name)" size="sm" />
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">{{ active.with.name }}</p>
                <p class="text-xs text-muted">{{ active.with.isAdmin ? 'Support' : active.with.isGuest ? 'Guest' : active.with.email }}</p>
              </div>
            </div>
            <div ref="scroller" class="flex-1 space-y-2 overflow-y-auto bg-elevated/30 px-3 py-4">
              <p v-if="!active.messages.length" class="py-8 text-center text-sm text-muted">Say hi 👋 We usually reply within the hour.</p>
              <div v-for="m in active.messages" :key="m.id" class="flex" :class="m.fromId === user?.id ? 'justify-end' : 'justify-start'">
                <div
                  class="max-w-[80%] space-y-1.5 rounded-2xl px-3 py-2 text-sm"
                  :class="m.fromId === user?.id ? 'rounded-br-sm bg-primary text-inverted' : 'rounded-bl-sm bg-default text-default ring ring-default'"
                >
                  <p v-if="m.body" class="whitespace-pre-wrap break-words">{{ m.body }}</p>
                  <AttachmentGrid v-if="m.attachments.length" :attachments="m.attachments" compact />
                  <p class="text-[10px] opacity-70">
                    <NuxtTime v-if="m.createdAt" :datetime="m.createdAt" relative :title="formatDateTime(m.createdAt)" />
                    <UIcon v-if="m.fromId === user?.id" :name="m.readAt ? 'i-lucide-check-check' : 'i-lucide-check'" class="ml-0.5 size-3 align-middle" />
                  </p>
                </div>
              </div>
            </div>
            <div class="border-t border-default p-2">
              <UTextarea
                v-model="draft"
                :rows="1"
                autoresize
                :maxrows="5"
                variant="none"
                placeholder="Write a message…"
                class="w-full"
                autofocus
                @keydown="onKeydown"
              />
              <div class="flex items-center gap-2">
                <FileChips v-model="files" :disabled="sending" class="flex-1" />
                <UButton icon="i-lucide-send-horizontal" size="sm" :loading="sending" :disabled="!draft.trim() && !files.length" aria-label="Send" @click="send" />
              </div>
            </div>
          </template>

          <!-- Conversation list -->
          <template v-else>
            <div class="border-b border-default px-4 py-3">
              <p class="font-semibold text-highlighted">Messages</p>
              <p class="text-xs text-muted">Talk to the support team</p>
            </div>
            <div class="flex-1 overflow-y-auto">
              <div v-if="!user" class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <UIcon name="i-lucide-life-buoy" class="size-10 text-primary" />
                <p class="text-sm text-muted">Need help? Chat with support without creating an account.</p>
                <UButton label="Start a chat" @click="startGuest" />
              </div>
              <UEmpty v-else-if="loaded && !sorted.length" icon="i-lucide-message-circle-off" title="No conversations yet" description="Support staff will appear here." />
              <button
                v-for="chat in sorted"
                :key="chat.id"
                class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-elevated/60"
                @click="select(chat)"
              >
                <UChip :show="chat.with.isAdmin" color="success" position="bottom-right" inset>
                  <UAvatar :text="initials(chat.with.name)" />
                </UChip>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-2">
                    <p class="truncate text-sm font-medium text-highlighted">{{ chat.with.name }}</p>
                    <span class="shrink-0 text-[11px] text-dimmed"><NuxtTime v-if="chat.lastMessageAt" :datetime="chat.lastMessageAt" relative :title="formatDateTime(chat.lastMessageAt)" /></span>
                  </div>
                  <p class="truncate text-xs" :class="unread(chat) ? 'font-medium text-highlighted' : 'text-muted'">{{ preview(chat) }}</p>
                </div>
                <UBadge v-if="unread(chat)" :label="String(unread(chat))" size="sm" class="rounded-full" />
              </button>
            </div>
          </template>
        </div>
      </template>
    </UPopover>
  </div>
</template>
