<script setup lang="ts">
export interface CommentNode extends CommentDTO {
  replies: CommentNode[]
}

/**
 * `endpoint` is the comments collection URL, e.g. /api/tickets/4/comments or /api/tasks/9/comments.
 * Tickets: `teamBadges` marks authors on the team (for viewers outside it); `allowInternal` lets staff reply with an
 * internal note. Internal notes are styled apart and replies under them stay internal.
 */
const props = defineProps<{
  comment: CommentNode
  endpoint: string
  people: PublicUser[]
  depth?: number
  readonly?: boolean
  teamBadges?: boolean
  allowInternal?: boolean
}>()
const emit = defineEmits<{ posted: [comment: CommentDTO]; deleted: [id: number] }>()

const { user } = useUserSession()
const toast = useToast()
const replying = ref(false)
const canDelete = computed(() => user.value?.isAdmin || props.comment.authorId === user.value?.id)

// Split the body into plain text and @mentions of known people. Rendered as text nodes, never as HTML.
const segments = computed(() => {
  const names = props.people.map((p) => p.name).sort((a, b) => b.length - a.length)
  if (!names.length) return [{ text: props.comment.body, mention: false }]
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(@(?:${escaped.join('|')}))(?!\\w)`)
  // With one capture group, split() puts every mention at an odd index.
  return props.comment.body.split(pattern).map((text, index) => ({ text, mention: index % 2 === 1 }))
})

async function remove() {
  try {
    await $fetch(`${props.endpoint}/${props.comment.id}`, { method: 'DELETE' })
    emit('deleted', props.comment.id)
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not delete the comment') })
  }
}

function onPosted(comment: CommentDTO) {
  replying.value = false
  emit('posted', comment)
}
</script>

<template>
  <div :id="`comment-${comment.id}`" class="scroll-mt-24">
    <div
      class="flex gap-3"
      :class="comment.internal && 'rounded-lg bg-amber-50 p-3 ring ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900'"
    >
      <UAvatar :text="initials(comment.authorName)" size="sm" class="mt-0.5 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <span class="text-sm font-medium text-highlighted">{{ comment.authorName }}</span>
          <UBadge v-if="teamBadges && comment.authorIsInternal" label="Team" size="sm" variant="soft" color="primary" icon="i-lucide-badge-check" class="self-center" />
          <span v-if="comment.internal" class="flex items-center gap-1 self-center text-xs font-medium text-amber-700 dark:text-amber-400">
            <UIcon name="i-lucide-lock" class="size-3" />
            Internal note
          </span>
          <NuxtTime v-if="comment.createdAt" :datetime="comment.createdAt" relative :title="formatDateTime(comment.createdAt)" class="text-xs text-muted" />
        </div>
        <p v-if="comment.body" class="mt-1 text-sm whitespace-pre-wrap break-words text-default">
          <template v-for="(segment, i) in segments" :key="i">
            <span v-if="segment.mention" class="rounded bg-primary/10 px-0.5 font-medium text-primary">{{ segment.text }}</span>
            <template v-else>{{ segment.text }}</template>
          </template>
        </p>
        <AttachmentGrid v-if="comment.attachments.length" :attachments="comment.attachments" compact class="mt-2" />
        <div class="mt-1 flex gap-1">
          <UButton v-if="!readonly && (!comment.internal || allowInternal) && (depth ?? 0) < 4" size="xs" variant="link" color="neutral" icon="i-lucide-reply" label="Reply" class="px-0" @click="replying = !replying" />
          <UButton v-if="canDelete" size="xs" variant="link" color="neutral" icon="i-lucide-trash-2" label="Delete" class="px-2" @click="remove" />
        </div>

        <CommentComposer
          v-if="replying"
          class="mt-2"
          :endpoint="endpoint"
          :people="people"
          :parent-id="comment.id"
          :force-internal="comment.internal"
          :placeholder="`Reply to ${comment.authorName}…`"
          autofocus
          @posted="onPosted"
          @cancel="replying = false"
        />

        <div v-if="comment.replies.length" class="mt-4 space-y-4 border-l-2 border-default pl-4">
          <CommentItem
            v-for="reply in comment.replies"
            :key="reply.id"
            :comment="reply"
            :endpoint="endpoint"
            :readonly="readonly"
            :team-badges="teamBadges"
            :allow-internal="allowInternal"
            :people="people"
            :depth="(depth ?? 0) + 1"
            @posted="(c) => emit('posted', c)"
            @deleted="(id) => emit('deleted', id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
