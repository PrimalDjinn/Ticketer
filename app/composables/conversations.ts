/**
 * Support conversations on the client:
 *  - `openSupportChat()` opens the chat widget from anywhere (optionally on one conversation)
 *  - `useSupportInbox()` shared inbox counters for the team, kept fresh by realtime
 *  - `useSupportChat()` the customer side of the widget (external people, guests, visitors)
 *  - `useDirectChats()` direct messages between teammates
 */
import { useDebounceFn } from '@vueuse/core'

/** Opens the chat widget on its support view; with an id, on that conversation's thread. */
export function openSupportChat(conversationId?: number) {
  useState<number | null>('support-chat-target', () => null).value = conversationId ?? null
  useState<boolean>('support-chat-open', () => false).value = true
}

const emptyStats = (): ConversationStats => ({ open: 0, unassigned: 0, mine: 0, unread: 0 })
const inboxListeners = new WeakSet<object>()

/**
 * Inbox counters for the team (`{ open, unassigned, mine, unread }`), shared by every caller and refreshed on
 * conversation events. People outside the team always get zeros.
 */
export function useSupportInbox() {
  const stats = useState<ConversationStats>('support-inbox-stats', emptyStats)
  // useState refs live as long as the app, so `refresh` keeps working after the first caller unmounts.
  const { user } = useUserSession()
  const request = useRequestFetch()

  async function refresh() {
    if (!isInternal(user.value)) {
      stats.value = emptyStats()
      return stats.value
    }
    stats.value = await request<ConversationStats>('/api/conversations/stats').catch(() => stats.value)
    return stats.value
  }

  if (import.meta.client) {
    const nuxtApp = useNuxtApp()
    if (!inboxListeners.has(nuxtApp)) {
      inboxListeners.add(nuxtApp)
      // Installed once for the app, detached from the calling component's lifetime.
      effectScope(true).run(() => {
        const soon = useDebounceFn(refresh, 400)
        const realtime = useRealtime().realtime
        realtime?.on('conversation.updated', soon)
        realtime?.on('conversation.message', soon)
        realtime?.on('conversation.read', soon)
        realtime?.onMeta('resync', soon)
        watch(() => [user.value?.id, user.value?.role], () => refresh(), { immediate: true })
      })
    }
  }

  return { stats, refresh }
}

// ---------------------------------------------------------------------------------------------------------------------
// Customer side of the widget
// ---------------------------------------------------------------------------------------------------------------------

/** Sorts newest activity first. */
export function byActivity(a: ConversationDTO, b: ConversationDTO) {
  return new Date(b.lastMessageAt ?? b.createdAt).getTime() - new Date(a.lastMessageAt ?? a.createdAt).getTime()
}

function upsertMessage(list: ConversationMessageDTO[], message: ConversationMessageDTO) {
  if (!list.some((m) => m.id === message.id)) list.push(message)
}

/**
 * State and actions for someone outside the team talking to support. Call from a component: realtime listeners live
 * as long as it does. `isViewing(id)` tells whether the thread is on screen (to mark messages read as they arrive).
 */
export function useSupportChat(options: { isViewing: (id: number) => boolean; onIncoming?: (m: ConversationMessageDTO) => void }) {
  const { user, fetch: refreshSession } = useUserSession()
  // The team uses the inbox page instead; this state stays empty for them.
  const outside = computed(() => !isInternal(user.value))
  const list = ref<ConversationDTO[]>([])
  const active = ref<ConversationDetailDTO | null>(null)
  const loaded = ref(false)
  const loadingThread = ref(false)
  const sending = ref(false)

  const unread = computed(() => list.value.reduce((sum, c) => sum + c.unread, 0))
  const sorted = computed(() => [...list.value].sort(byActivity))
  /** The conversation the widget continues by default: the latest open one, else the latest one. */
  const latest = computed(() => sorted.value.find((c) => c.status === 'open') ?? sorted.value[0] ?? null)

  async function load() {
    if (!user.value || !outside.value) {
      list.value = []
      active.value = null
      loaded.value = true
      return
    }
    const page = await $fetch<ConversationPage>('/api/conversations', { query: { status: 'all', pageSize: 50 } }).catch(() => null)
    list.value = page?.items ?? []
    loaded.value = true
    if (active.value) await open(active.value.id, { quiet: true })
  }

  async function open(id: number, opts: { quiet?: boolean } = {}) {
    if (!opts.quiet) loadingThread.value = true
    try {
      active.value = await $fetch<ConversationDetailDTO>(`/api/conversations/${id}`)
      if (options.isViewing(id)) await markRead(id)
    } catch {
      active.value = null
    } finally {
      loadingThread.value = false
    }
  }

  function close() {
    active.value = null
  }

  async function markRead(id: number) {
    const item = list.value.find((c) => c.id === id)
    if (item) item.unread = 0
    if (active.value?.id === id) active.value.unread = 0
    await $fetch(`/api/conversations/${id}/read`, { method: 'POST' }).catch(() => {})
  }

  function remember(conversation: ConversationDTO) {
    const index = list.value.findIndex((c) => c.id === conversation.id)
    if (index === -1) list.value.push(conversation)
    else list.value.splice(index, 1, { ...list.value[index]!, ...conversation, unread: list.value[index]!.unread })
  }

  /** Starts a conversation; a visitor without a session becomes a guest on the way. */
  async function start(input: { subject?: string; body: string; files: File[]; headers?: Record<string, string> }) {
    sending.value = true
    try {
      const form = new FormData()
      form.set('body', input.body.trim())
      if (input.subject?.trim()) form.set('subject', input.subject.trim())
      for (const file of input.files) form.append('files', file)
      const hadSession = !!user.value
      const detail = await $fetch<ConversationDetailDTO>('/api/conversations', { method: 'POST', body: form, headers: input.headers })
      if (!hadSession) await refreshSession()
      active.value = detail
      remember({ ...detail, unread: 0 })
      return detail
    } finally {
      sending.value = false
    }
  }

  async function send(input: { body: string; files: File[] }) {
    if (!active.value) return
    sending.value = true
    try {
      const form = new FormData()
      form.set('body', input.body.trim())
      for (const file of input.files) form.append('files', file)
      const message = await $fetch<ConversationMessageDTO>(`/api/conversations/${active.value.id}/messages`, { method: 'POST', body: form })
      upsertMessage(active.value.messages, message)
      active.value.lastMessageAt = message.createdAt
      if (active.value.status === 'closed') active.value.status = 'open'
      return message
    } finally {
      sending.value = false
    }
  }

  watch(() => [user.value?.id, outside.value], () => load(), { immediate: import.meta.client })
  onRealtimeResync(load)

  onRealtime('conversation.message', (message) => {
    if (message.internal || !outside.value) return
    const item = list.value.find((c) => c.id === message.conversationId)
    if (!item) return load()
    const mine = message.authorId === user.value?.id
    item.lastMessageAt = message.createdAt
    item.preview = { body: message.body || '(attachment)', fromTeam: message.fromTeam, internal: false, authorName: message.authorName, createdAt: message.createdAt }
    if (active.value?.id === message.conversationId) {
      upsertMessage(active.value.messages, message)
      active.value.lastMessageAt = message.createdAt
    }
    if (mine) return
    if (options.isViewing(message.conversationId)) markRead(message.conversationId)
    else item.unread += 1
    options.onIncoming?.(message)
  })
  onRealtime('conversation.updated', (conversation) => {
    if (conversation.customer.id !== user.value?.id) return
    remember(conversation)
    if (active.value?.id === conversation.id) {
      const { unread: _unread, preview: _preview, ...rest } = conversation
      Object.assign(active.value, rest)
    }
  })
  onRealtime('conversation.read', ({ conversationId, userId, readAt }) => {
    if (userId === user.value?.id || active.value?.id !== conversationId) return
    active.value.teamReadAt = readAt
  })

  return { user, list, sorted, latest, active, loaded, loadingThread, sending, unread, load, open, close, start, send, markRead }
}

export type SupportChat = ReturnType<typeof useSupportChat>

// ---------------------------------------------------------------------------------------------------------------------
// Direct messages between teammates
// ---------------------------------------------------------------------------------------------------------------------

export function useDirectChats(options: { isViewing: (chatId: string) => boolean; onIncoming?: (m: MessageDTO) => void }) {
  const { user } = useUserSession()
  const { internal } = useAccess()
  const chats = ref<ChatDTO[]>([])
  const activeId = ref<string | null>(null)
  const loaded = ref(false)
  const sending = ref(false)

  const active = computed(() => chats.value.find((c) => c.id === activeId.value) ?? null)
  const unreadOf = (chat: ChatDTO) => chat.messages.filter((m) => m.toId === user.value?.id && !m.readAt).length
  const unread = computed(() => chats.value.reduce((sum, c) => sum + unreadOf(c), 0))
  const sorted = computed(() =>
    [...chats.value].sort(
      (a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime() || a.with.name.localeCompare(b.with.name),
    ),
  )

  async function load() {
    if (!internal.value) {
      chats.value = []
      loaded.value = true
      return
    }
    chats.value = await $fetch<ChatDTO[]>('/api/chats').catch(() => [])
    loaded.value = true
  }

  async function markRead(chat: ChatDTO) {
    if (!unreadOf(chat)) return
    const now = new Date().toISOString()
    chat.messages.forEach((m) => m.toId === user.value?.id && !m.readAt && (m.readAt = now))
    await $fetch(`/api/chats/${encodeURIComponent(chat.id)}/read`, { method: 'POST' }).catch(() => {})
  }

  function select(chat: ChatDTO | null) {
    activeId.value = chat?.id ?? null
    if (chat) markRead(chat)
  }

  async function send(input: { body: string; files: File[] }) {
    const chat = active.value
    if (!chat) return
    sending.value = true
    try {
      const form = new FormData()
      form.set('to', chat.with.id)
      form.set('body', input.body.trim())
      for (const file of input.files) form.append('files', file)
      const message = await $fetch<MessageDTO>('/api/chats/messages', { method: 'POST', body: form })
      if (!chat.messages.some((m) => m.id === message.id)) chat.messages.push(message)
      chat.lastMessageAt = message.createdAt
      return message
    } finally {
      sending.value = false
    }
  }

  watch(() => [user.value?.id, internal.value], load, { immediate: import.meta.client })
  onRealtimeResync(load)
  onRealtime('message.created', (message) => {
    const chat = chats.value.find((c) => c.id === message.chatId)
    if (!chat) return load()
    if (!chat.messages.some((m) => m.id === message.id)) chat.messages.push(message)
    chat.lastMessageAt = message.createdAt
    if (message.toId !== user.value?.id) return
    if (options.isViewing(chat.id)) markRead(chat)
    else options.onIncoming?.(message)
  })
  onRealtime('messages.read', ({ chatId }) => {
    const chat = chats.value.find((c) => c.id === chatId)
    const now = new Date().toISOString()
    chat?.messages.forEach((m) => m.fromId === user.value?.id && !m.readAt && (m.readAt = now))
  })

  return { user, chats, sorted, active, activeId, loaded, sending, unread, unreadOf, load, select, send, markRead }
}

export type DirectChats = ReturnType<typeof useDirectChats>
