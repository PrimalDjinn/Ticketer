<script setup lang="ts">
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'

definePageMeta({ layout: 'public' })

const appName = useRuntimeConfig().public.appName || 'Ticketer'
const route = useRoute()
const toast = useToast()
const reference = computed(() => String(route.params.reference))

const { data: issue, error, refresh } = await useFetch<PublicTicketDetailDTO>(() => `/api/public/tickets/${encodeURIComponent(reference.value)}`)
if (error.value || !issue.value) {
  throw createError({ status: error.value?.statusCode ?? 404, message: 'This issue does not exist or is no longer public', fatal: true })
}

// Live-ish: refresh every 30 seconds while the tab is visible.
const visibility = useDocumentVisibility()
useIntervalFn(() => visibility.value === 'visible' && refresh(), 30_000)

const description = computed(() => issue.value?.excerpt.slice(0, 200) ?? '')
useSeoMeta({
  title: () => `${issue.value?.title ?? 'Issue'} · ${appName}`,
  description,
  ogTitle: () => issue.value?.title ?? 'Issue',
  ogDescription: description,
  ogType: 'article',
})

/** Replies in reading order, each with its depth (replies to replies are indented, up to three levels). */
const replies = computed(() => {
  const list = issue.value?.comments ?? []
  const children = new Map<number | null, PublicCommentDTO[]>()
  const ids = new Set(list.map((c) => c.id))
  for (const c of list) {
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : null
    if (!children.has(key)) children.set(key, [])
    children.get(key)!.push(c)
  }
  const out: { comment: PublicCommentDTO; depth: number; parent: PublicCommentDTO | undefined }[] = []
  const walk = (parentId: number | null, depth: number) => {
    for (const c of children.get(parentId) ?? []) {
      out.push({ comment: c, depth: Math.min(depth, 3), parent: parentId ? list.find((p) => p.id === parentId) : undefined })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

const signInLink = computed(() => ({ path: '/auth/login', query: { redirect: route.fullPath } }))
const viewer = computed(() => issue.value?.viewer ?? null)

const following = ref(false)
async function toggleFollow() {
  if (!issue.value) return
  following.value = true
  try {
    const state = await $fetch<{ watching: boolean; watcherCount: number }>(`/api/tickets/${issue.value.id}/watch`, {
      method: viewer.value?.watching ? 'DELETE' : 'POST',
    })
    issue.value.watcherCount = state.watcherCount
    if (issue.value.viewer) issue.value.viewer.watching = state.watching
    toast.add({ title: state.watching ? 'Following: you will be notified of updates' : 'Unfollowed', icon: state.watching ? 'i-lucide-bell-ring' : 'i-lucide-bell-off' })
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    following.value = false
  }
}

async function onPosted() {
  await refresh()
  toast.add({ title: 'Reply posted', icon: 'i-lucide-circle-check', color: 'success' })
}

async function copyLink() {
  await navigator.clipboard.writeText(window.location.href)
  toast.add({ title: 'Link copied', icon: 'i-lucide-copy-check' })
}
</script>

<template>
  <div v-if="issue" class="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
    <UButton to="/issues" icon="i-lucide-arrow-left" label="All issues" color="neutral" variant="link" class="mb-4 px-0" />

    <div class="grid gap-8 lg:grid-cols-[1fr_16rem]">
      <article class="min-w-0 space-y-8">
        <header class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <TicketStatusBadge :status="issue.status" />
            <UBadge v-if="issue.urgency !== 'Default'" :color="urgencyMeta[issue.urgency].color" variant="soft" icon="i-lucide-flame" :label="urgencyMeta[issue.urgency].label" />
            <span class="font-mono text-xs text-muted">#{{ shortRef(issue.reference) }}</span>
          </div>
          <h1 class="text-2xl font-semibold tracking-tight break-words text-highlighted sm:text-3xl">{{ issue.title }}</h1>
          <p class="text-sm text-muted">
            <template v-if="issue.reporterName">Reported by {{ issue.reporterName }} · </template>
            <NuxtTime :datetime="issue.createdAt" date-style="medium" />
          </p>
        </header>

        <section class="space-y-4">
          <p class="leading-relaxed whitespace-pre-wrap break-words text-default">{{ issue.info }}</p>
          <AttachmentGrid :attachments="issue.attachments" />
        </section>

        <section class="space-y-5" aria-labelledby="replies-heading">
          <h2 id="replies-heading" class="flex items-center gap-2 border-b border-default pb-2 text-sm font-semibold text-highlighted">
            <UIcon name="i-lucide-messages-square" class="size-4" />
            Updates and replies
            <UBadge :label="String(issue.replyCount)" color="neutral" variant="subtle" size="sm" />
          </h2>

          <p v-if="!replies.length" class="text-sm text-muted">No replies yet.</p>
          <ol v-else class="space-y-5">
            <li
              v-for="{ comment, depth, parent } in replies"
              :id="`comment-${comment.id}`"
              :key="comment.id"
              class="flex scroll-mt-20 gap-3"
              :style="{ marginLeft: `${depth * 1.25}rem` }"
            >
              <UAvatar :text="initials(comment.authorName)" size="sm" class="mt-0.5 shrink-0" :class="comment.fromTeam && 'ring-2 ring-primary/50'" />
              <div class="min-w-0 flex-1 rounded-lg px-3 py-2" :class="comment.fromTeam ? 'bg-primary/5 ring ring-primary/15' : 'bg-elevated/40'">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span class="text-sm font-medium text-highlighted">{{ comment.authorName }}</span>
                  <UBadge v-if="comment.fromTeam" label="Team" size="sm" variant="soft" color="primary" icon="i-lucide-badge-check" />
                  <NuxtTime :datetime="comment.createdAt" relative class="text-xs text-muted" />
                  <span v-if="parent" class="text-xs text-dimmed">· replying to {{ parent.authorName }}</span>
                </div>
                <p v-if="comment.body" class="mt-1 text-sm whitespace-pre-wrap break-words text-default">{{ comment.body }}</p>
                <p v-else-if="!comment.attachments.length" class="mt-1 text-sm text-dimmed italic">This reply was removed.</p>
                <AttachmentGrid v-if="comment.attachments.length" :attachments="comment.attachments" compact class="mt-2" />
              </div>
            </li>
          </ol>

            <CommentComposer
              v-if="viewer?.canReply"
              :endpoint="`/api/tickets/${issue.id}/comments`"
              :people="[]"
              placeholder="Add details or ask a question… everyone can read replies here"
              submit-label="Reply"
              @posted="onPosted"
            />
            <UAlert
              v-else-if="!viewer?.registered"
              color="neutral"
              variant="subtle"
              icon="i-lucide-log-in"
              title="Sign in to reply or follow"
              description="Follow this issue to be notified when its status changes or the team posts an update."
              :actions="[{ label: 'Sign in', to: signInLink, icon: 'i-lucide-log-in' }]"
            />
            <p v-else class="text-sm text-muted">You have read-only access to this issue.</p>
        </section>
      </article>

      <aside class="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <UCard variant="subtle">
          <div class="space-y-3">
              <UButton
                v-if="viewer?.canFollow"
                :icon="viewer.watching ? 'i-lucide-bell-off' : 'i-lucide-bell'"
                :label="viewer.watching ? 'Unfollow' : 'Follow'"
                :color="viewer.watching ? 'neutral' : 'primary'"
                :variant="viewer.watching ? 'outline' : 'solid'"
                block
                :loading="following"
                @click="toggleFollow"
              />
              <UButton v-else-if="!viewer?.registered" :to="signInLink" icon="i-lucide-bell" label="Sign in to follow" color="neutral" variant="outline" block />
            <p class="flex items-center justify-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-users" class="size-3.5" />
              {{ issue.watcherCount }} follower{{ issue.watcherCount === 1 ? '' : 's' }}
            </p>
          </div>
        </UCard>

        <UCard variant="subtle">
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-muted">Status</dt>
              <dd class="mt-1"><TicketStatusBadge :status="issue.status" size="sm" /></dd>
            </div>
            <div>
              <dt class="text-muted">Urgency</dt>
              <dd class="mt-0.5 text-highlighted">{{ urgencyMeta[issue.urgency].label }}</dd>
            </div>
            <div v-if="issue.assigneeName">
              <dt class="text-muted">Handled by</dt>
              <dd class="mt-0.5 text-highlighted">{{ issue.assigneeName }}</dd>
            </div>
            <div>
              <dt class="text-muted">Reported</dt>
              <dd class="mt-0.5 text-highlighted"><NuxtTime :datetime="issue.createdAt" date-style="medium" time-style="short" /></dd>
            </div>
            <div>
              <dt class="text-muted">Last update</dt>
              <dd class="mt-0.5 text-highlighted"><NuxtTime :datetime="issue.lastActivityAt" relative /></dd>
            </div>
            <div v-if="issue.resolvedAt">
              <dt class="text-muted">{{ issue.status === 'Closed' ? 'Closed' : 'Resolved' }}</dt>
              <dd class="mt-0.5 text-highlighted"><NuxtTime :datetime="issue.resolvedAt" date-style="medium" time-style="short" /></dd>
            </div>
          </dl>
        </UCard>

        <div class="flex flex-col gap-2">
          <UButton icon="i-lucide-link" label="Copy link" color="neutral" variant="ghost" size="sm" block @click="copyLink" />
          <UButton v-if="viewer?.internal || (viewer?.isReporter && viewer.registered)" :to="`/tickets/${issue.id}`" icon="i-lucide-external-link" label="Open in app" color="neutral" variant="ghost" size="sm" block />
        </div>
      </aside>
    </div>
  </div>
</template>
