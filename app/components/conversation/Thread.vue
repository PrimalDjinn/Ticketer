<script setup lang="ts">
/**
 * A support conversation's messages with day separators. `side` is who is looking: the team sees its own replies on
 * the right, the customer sees theirs on the right. Internal notes (team only) are amber with a lock.
 */
const props = defineProps<{
  messages: ConversationMessageDTO[]
  side: 'team' | 'customer'
  /** When the other side last read the thread: shows "Seen" under the newest message from this side. */
  seenAt?: string | number | Date | null
  compact?: boolean
}>()

const isOwnSide = (m: ConversationMessageDTO) => (props.side === 'team' ? m.fromTeam : !m.fromTeam)

/** Last message from this side the other side may see (internal notes never count). */
const lastOwn = computed(() => [...props.messages].reverse().find((m) => isOwnSide(m) && !m.internal) ?? null)
const seen = computed(() => !!lastOwn.value && !!props.seenAt && new Date(props.seenAt).getTime() >= new Date(lastOwn.value.createdAt).getTime())

const groups = computed(() => {
  const out: { day: string; date: Date; items: ConversationMessageDTO[] }[] = []
  for (const m of props.messages) {
    const date = new Date(m.createdAt)
    const day = date.toDateString()
    const last = out.at(-1)
    if (last?.day === day) last.items.push(m)
    else out.push({ day, date, items: [m] })
  }
  return out
})

function dayLabel(date: Date) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/** Consecutive messages by the same author drop the repeated name. */
function showAuthor(items: ConversationMessageDTO[], index: number) {
  const m = items[index]!
  const prev = items[index - 1]
  // The customer knows who they are; the team wants to see which teammate wrote what.
  if (props.side === 'customer' && !m.fromTeam) return false
  return !prev || prev.authorId !== m.authorId || prev.internal !== m.internal
}

function time(value: string | number | Date) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
</script>

<template>
  <div class="space-y-4">
    <section v-for="group in groups" :key="group.day" class="space-y-1.5">
      <div class="flex justify-center py-1" :class="compact ? '' : 'sticky top-0 z-[1]'">
        <span class="rounded-full bg-default/90 px-2.5 py-0.5 text-[11px] font-medium text-muted ring ring-default backdrop-blur">{{ dayLabel(group.date) }}</span>
      </div>
      <div
        v-for="(m, index) in group.items"
        :key="m.id"
        class="flex flex-col"
        :class="[isOwnSide(m) ? 'items-end' : 'items-start', index && group.items[index - 1]!.fromTeam !== m.fromTeam ? 'pt-2' : '']"
      >
        <p v-if="showAuthor(group.items, index)" class="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-muted">
          <UIcon v-if="m.internal" name="i-lucide-lock" class="size-3 text-warning" />
          <span class="font-medium" :class="m.internal ? 'text-warning' : 'text-default'">{{ m.authorName }}</span>
          <UBadge v-if="m.fromTeam && side === 'customer'" label="Team" size="sm" color="primary" variant="subtle" class="px-1 py-0 text-[10px]" />
          <span v-if="m.internal">· internal note</span>
        </p>
        <div
          class="max-w-[85%] space-y-1.5 rounded-2xl px-3 py-2 text-sm"
          :class="
            m.internal
              ? 'rounded-tr-sm bg-warning/10 text-default ring ring-warning/40'
              : isOwnSide(m)
                ? 'rounded-br-sm bg-primary text-inverted'
                : 'rounded-bl-sm bg-default text-default ring ring-default'
          "
        >
          <p v-if="m.body" class="whitespace-pre-wrap break-words">{{ m.body }}</p>
          <AttachmentGrid v-if="m.attachments.length" :attachments="m.attachments" compact />
          <p class="text-[10px] opacity-70" :title="formatDateTime(m.createdAt)">{{ time(m.createdAt) }}</p>
        </div>
        <p v-if="lastOwn?.id === m.id && seen" class="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-muted">
          <UIcon name="i-lucide-check-check" class="size-3" />
          Seen
        </p>
      </div>
    </section>
  </div>
</template>
