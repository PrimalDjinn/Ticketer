<script setup lang="ts">
/** One row of the support inbox. */
defineProps<{ conversation: ConversationDTO; selected?: boolean }>()
</script>

<template>
  <NuxtLink
    :to="{ query: { ...$route.query, c: conversation.id } }"
    replace
    class="flex w-full items-start gap-3 border-b border-default px-4 py-3 text-left transition"
    :class="selected ? 'bg-elevated' : 'hover:bg-elevated/50'"
    :aria-current="selected ? 'true' : undefined"
  >
    <div class="relative shrink-0">
      <UAvatar :text="initials(conversation.customer.name)" size="md" />
      <span v-if="conversation.unread" class="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-default" aria-label="Unread" />
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <p class="truncate text-sm" :class="conversation.unread ? 'font-semibold text-highlighted' : 'font-medium text-default'">{{ conversation.customer.name }}</p>
        <UBadge v-if="conversation.customer.isGuest" label="Guest" size="sm" color="neutral" variant="subtle" class="shrink-0 px-1 py-0 text-[10px]" />
        <span class="ml-auto shrink-0 text-[11px] text-dimmed"><NuxtTime :datetime="conversation.lastMessageAt ?? conversation.createdAt" relative /></span>
      </div>
      <p v-if="conversation.subject" class="truncate text-xs font-medium text-default">{{ conversation.subject }}</p>
      <div class="mt-0.5 flex items-center gap-2">
        <p class="min-w-0 flex-1 truncate text-xs" :class="conversation.unread ? 'text-highlighted' : 'text-muted'">
          <UIcon v-if="conversation.preview?.internal" name="i-lucide-lock" class="size-3 align-[-2px] text-warning" />
          <template v-if="conversation.preview">
            {{ conversation.preview.fromTeam ? `${conversation.preview.authorName}: ` : '' }}{{ conversation.preview.body }}
          </template>
          <template v-else>No messages yet</template>
        </p>
        <UBadge v-if="conversation.unread" :label="String(conversation.unread)" size="sm" class="shrink-0 rounded-full" />
        <UIcon v-if="conversation.ticketId" name="i-lucide-life-buoy" class="size-3.5 shrink-0 text-info" aria-label="Has a ticket" />
        <UTooltip v-if="conversation.assigneeName" :text="`Assigned to ${conversation.assigneeName}`">
          <UAvatar :text="initials(conversation.assigneeName)" size="3xs" class="shrink-0" />
        </UTooltip>
      </div>
    </div>
  </NuxtLink>
</template>
