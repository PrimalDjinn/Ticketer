<script setup lang="ts">
/** Direct messages between teammates: a list of people, then one conversation. */
const props = defineProps<{ dm: DirectChats }>()
const scroller = useTemplateRef<HTMLElement>('scroller')
const active = computed(() => props.dm.active.value)
const me = computed(() => props.dm.user.value?.id)

watch(
  () => [active.value?.id, active.value?.messages.length],
  (now, before) => nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: now[0] === before?.[0] ? 'smooth' : 'auto' })),
  { immediate: true },
)

function preview(chat: ChatDTO) {
  const last = chat.messages.at(-1)
  if (!last) return roleMeta[chat.with.role]?.label ?? 'Teammate'
  if (last.body) return `${last.fromId === me.value ? 'You: ' : ''}${last.body}`
  return last.attachments.length === 1 ? last.attachments[0]!.name : `${last.attachments.length} files`
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <template v-if="active">
      <div class="flex items-center gap-2 border-b border-default px-2 py-2">
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" aria-label="Back to teammates" @click="dm.select(null)" />
        <UAvatar :text="initials(active.with.name)" size="sm" />
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-highlighted">{{ active.with.name }}</p>
          <p class="truncate text-xs text-muted">{{ roleMeta[active.with.role]?.label }} · {{ active.with.email }}</p>
        </div>
      </div>
      <div ref="scroller" class="flex-1 space-y-2 overflow-y-auto bg-elevated/30 px-3 py-4">
        <p v-if="!active.messages.length" class="py-8 text-center text-sm text-muted">Start a conversation with {{ active.with.name }}.</p>
        <div v-for="m in active.messages" :key="m.id" class="flex" :class="m.fromId === me ? 'justify-end' : 'justify-start'">
          <div
            class="max-w-[80%] space-y-1.5 rounded-2xl px-3 py-2 text-sm"
            :class="m.fromId === me ? 'rounded-br-sm bg-primary text-inverted' : 'rounded-bl-sm bg-default text-default ring ring-default'"
          >
            <p v-if="m.body" class="whitespace-pre-wrap break-words">{{ m.body }}</p>
            <AttachmentGrid v-if="m.attachments.length" :attachments="m.attachments" compact />
            <p class="text-[10px] opacity-70">
              <NuxtTime :datetime="m.createdAt" relative :title="formatDateTime(m.createdAt)" />
              <UIcon v-if="m.fromId === me" :name="m.readAt ? 'i-lucide-check-check' : 'i-lucide-check'" class="ml-0.5 size-3 align-middle" />
            </p>
          </div>
        </div>
      </div>
      <div class="border-t border-default p-2">
        <ConversationComposer :send="dm.send" compact autofocus :placeholder="`Message ${active.with.name}…`" />
      </div>
    </template>

    <div v-else class="flex-1 overflow-y-auto">
      <UEmpty v-if="dm.loaded.value && !dm.sorted.value.length" icon="i-lucide-users" title="No teammates yet" description="Invite people from the Members page." class="py-10" />
      <button
        v-for="chat in dm.sorted.value"
        :key="chat.id"
        type="button"
        class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-elevated/60"
        @click="dm.select(chat)"
      >
        <UAvatar :text="initials(chat.with.name)" size="sm" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <p class="truncate text-sm font-medium text-highlighted">{{ chat.with.name }}</p>
            <span v-if="chat.lastMessageAt" class="shrink-0 text-[11px] text-dimmed"><NuxtTime :datetime="chat.lastMessageAt" relative /></span>
          </div>
          <p class="truncate text-xs" :class="dm.unreadOf(chat) ? 'font-medium text-highlighted' : 'text-muted'">{{ preview(chat) }}</p>
        </div>
        <UBadge v-if="dm.unreadOf(chat)" :label="String(dm.unreadOf(chat))" size="sm" class="rounded-full" />
      </button>
    </div>
  </div>
</template>
