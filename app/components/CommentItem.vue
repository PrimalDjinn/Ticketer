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

// @mentions of known people are highlighted inside the markdown.
const mentionNames = computed(() => props.people.map((p) => p.name))

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
          <ULink v-if="comment.external" :to="comment.external.url ?? undefined" target="_blank" class="self-center" :aria-label="`${comment.authorName}'s comment on GitHub`">
            <UBadge label="via GitHub" size="sm" variant="soft" color="neutral" icon="i-lucide-github" />
          </ULink>
          <span v-if="comment.internal" class="flex items-center gap-1 self-center text-xs font-medium text-amber-700 dark:text-amber-400">
            <UIcon name="i-lucide-lock" class="size-3" />
            Internal note
          </span>
          <NuxtTime v-if="comment.createdAt" :datetime="comment.createdAt" relative :title="formatDateTime(comment.createdAt)" class="text-xs text-muted" />
        </div>
        <MarkdownText v-if="comment.body" :text="comment.body" :mentions="mentionNames" class="mt-1 text-sm text-default" />
        <p v-else-if="!comment.attachments.length" class="mt-1 text-sm text-dimmed italic">This reply was removed.</p>
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
