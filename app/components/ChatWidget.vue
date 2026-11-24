<script setup lang="ts">
/**
 * Chat button and popover.
 *  - People outside the team (external accounts, guests, visitors without an account): "Chat with support". A visitor
 *    gets a guest session on their first message and keeps the conversation if they register later.
 *  - The team: a Support tab (open inbox conversations, each opens /conversations) and a Team tab (direct messages).
 * Other code opens it with `openSupportChat(id?)`.
 */
/** `floating`: round button in the corner (sign-in and public pages). `inline`: icon button for the app's top bar. */
const props = withDefaults(defineProps<{ variant?: 'floating' | 'inline' }>(), { variant: 'floating' })

const { internal } = useAccess()
const open = useState<boolean>('support-chat-open', () => false)
const target = useState<number | null>('support-chat-target', () => null)
const tab = ref<'support' | 'team'>('support')
const supportView = ref<'thread' | 'new' | 'list'>('thread')

function ping() {
  new Audio('/notification.mp3').play().catch(() => {})
}

const chat = useSupportChat({
  isViewing: (id) => open.value && !internal.value && supportView.value === 'thread' && chat.active.value?.id === id,
  onIncoming: () => !open.value && ping(),
})
const dm = useDirectChats({
  isViewing: (chatId) => open.value && internal.value && tab.value === 'team' && dm.activeId.value === chatId,
  onIncoming: ping,
})
const { stats } = useSupportInbox()

const badge = computed(() => (internal.value ? stats.value.unread + dm.unread.value : chat.unread.value))

/** Picks what to show when the popover opens: a requested conversation, the latest one, or the start screen. */
async function prepare() {
  const id = target.value
  target.value = null
  if (internal.value) {
    if (id) {
      open.value = false
      await navigateTo(`/conversations?c=${id}`)
    }
    return
  }
  if (!chat.loaded.value) await chat.load()
  if (id) {
    supportView.value = 'thread'
    await chat.open(id)
    return
  }
  if (chat.active.value) {
    supportView.value = 'thread'
    if (chat.active.value.unread) chat.markRead(chat.active.value.id)
    return
  }
  const latest = chat.latest.value
  if (latest && latest.status === 'open') {
    supportView.value = 'thread'
    await chat.open(latest.id)
  } else {
    supportView.value = 'new'
  }
}

watch(open, (value) => value && prepare(), { immediate: true })

// Notification links for customers point at `?chat=<id>`: open that conversation and tidy the URL.
const route = useRoute()
watch(
  () => route.query.chat,
  (value) => {
    const id = Number(Array.isArray(value) ? value[0] : value)
    if (!Number.isInteger(id) || id <= 0) return
    target.value = id
    open.value = true
    const { chat: _chat, ...rest } = route.query
    navigateTo({ query: rest }, { replace: true })
  },
  { immediate: true },
)
// Opened again from elsewhere while already open (e.g. a different conversation).
watch(target, (id) => id && open.value && prepare())

// Leaving the thread view clears the thread so the next open picks again.
function showList() {
  supportView.value = 'list'
}
function startNew() {
  chat.close()
  supportView.value = 'new'
}
</script>

<template>
  <div :class="props.variant === 'floating' ? 'fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6' : 'contents'">
    <UPopover
      v-model:open="open"
      :content="props.variant === 'floating' ? { side: 'top', align: 'end', sideOffset: 12 } : { side: 'bottom', align: 'end', sideOffset: 8 }"
      :ui="{ content: 'w-[calc(100vw-2rem)] sm:w-96 p-0 overflow-hidden' }"
    >
      <UChip v-if="props.variant === 'floating'" :show="badge > 0" :text="badge" color="error" size="3xl">
        <UButton size="xl" class="rounded-full shadow-lg" :icon="open ? 'i-lucide-x' : 'i-lucide-message-circle'" :aria-label="internal ? 'Messages' : 'Chat with support'" />
      </UChip>
      <UTooltip v-else :text="internal ? 'Messages' : 'Chat with support'">
        <UButton color="neutral" variant="ghost" square :aria-label="internal ? 'Messages' : 'Chat with support'">
          <UChip :show="badge > 0" color="error" inset>
            <UIcon name="i-lucide-message-circle" class="size-5 shrink-0" />
          </UChip>
        </UButton>
      </UTooltip>

      <template #content>
        <div class="flex h-[min(34rem,75vh)] flex-col">
          <!-- Team -->
          <template v-if="internal">
            <div class="flex items-center gap-2 border-b border-default px-3 py-2">
              <UTabs
                v-model="tab"
                :items="[
                  { label: 'Support', value: 'support', icon: 'i-lucide-life-buoy', badge: stats.unread ? String(stats.unread) : undefined },
                  { label: 'Team', value: 'team', icon: 'i-lucide-users', badge: dm.unread.value ? String(dm.unread.value) : undefined },
                ]"
                :content="false"
                size="xs"
                variant="pill"
                class="w-full"
              />
            </div>
            <ChatInboxPanel v-if="tab === 'support'" @navigate="open = false" />
            <ChatDirectPanel v-else :dm="dm" />
          </template>

          <!-- Everyone else -->
          <template v-else>
            <div class="flex items-center gap-2 border-b border-default px-3 py-2.5">
              <UButton
                v-if="supportView !== 'thread' && chat.active.value"
                icon="i-lucide-arrow-left"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Back to the conversation"
                @click="supportView = 'thread'"
              />
              <span v-else class="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <UIcon name="i-lucide-life-buoy" class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-highlighted">Chat with support</p>
                <p class="truncate text-xs text-muted">{{ supportView === 'list' ? 'Your conversations' : 'We usually reply within a few hours' }}</p>
              </div>
              <UTooltip v-if="chat.sorted.value.length && supportView !== 'list'" text="Your conversations">
                <UButton icon="i-lucide-history" color="neutral" variant="ghost" size="sm" square aria-label="Your conversations" @click="showList" />
              </UTooltip>
              <UTooltip v-if="supportView !== 'new'" text="New conversation">
                <UButton icon="i-lucide-square-pen" color="neutral" variant="ghost" size="sm" square aria-label="New conversation" @click="startNew" />
              </UTooltip>
            </div>
            <ChatSupportPanel v-model:view="supportView" :chat="chat" />
          </template>
        </div>
      </template>
    </UPopover>
  </div>
</template>
