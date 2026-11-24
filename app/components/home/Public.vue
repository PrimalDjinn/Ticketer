<script setup lang="ts">
/**
 * The front page for visitors who aren't signed in (and guests): ways to get help, the team's typical reply time,
 * and the current public issues. Signed-in people get their dashboard instead.
 */
const { loggedIn } = useUserSession()
const { data: overview, refresh: refreshOverview } = await usePublicOverview()
useLivePublicIssues(refreshOverview)
const { data: signup } = await useFetch<SignupInfo>('/api/auth/signup', { key: 'signup-info' })
const canRegister = computed(() => !!signup.value && (signup.value.firstAccount || signup.value.mode !== 'invite'))

useSeoMeta({
  title: 'Help',
  description: 'Report an issue, chat with the team, or check the status of known issues.',
})
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-10 sm:py-16">
    <section class="mx-auto max-w-2xl text-center">
      <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">How can we help?</h1>
      <p class="mt-3 text-lg text-muted">Report a problem, ask the team a question, or check what we already know about.</p>
      <p class="mt-4 inline-flex items-center gap-2 rounded-full bg-elevated px-3 py-1 text-sm text-muted ring ring-default">
        <span class="size-2 rounded-full bg-success" aria-hidden="true" />
        {{ overview.reply.text ?? 'The team replies here as soon as they can' }}
      </p>
    </section>

    <section class="mt-10 grid gap-4 sm:grid-cols-3" aria-label="Ways to get help">
      <NuxtLink to="/tickets/new" class="group rounded-xl bg-default p-5 ring ring-default transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/50">
        <span class="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-lucide-square-pen" class="size-5" />
        </span>
        <p class="mt-4 font-semibold text-highlighted">Report an issue</p>
        <p class="mt-1 text-sm text-muted">Describe what went wrong and attach screenshots. No account needed.</p>
      </NuxtLink>
      <button type="button" class="group rounded-xl bg-default p-5 text-left ring ring-default transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/50" @click="openSupportChat()">
        <span class="grid size-10 place-items-center rounded-lg bg-success/10 text-success">
          <UIcon name="i-lucide-messages-square" class="size-5" />
        </span>
        <p class="mt-4 font-semibold text-highlighted">Start a chat</p>
        <p class="mt-1 text-sm text-muted">Ask a quick question. Anyone on the team can pick it up.</p>
      </button>
      <NuxtLink to="/issues" class="group rounded-xl bg-default p-5 ring ring-default transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/50">
        <span class="grid size-10 place-items-center rounded-lg bg-info/10 text-info">
          <UIcon name="i-lucide-activity" class="size-5" />
        </span>
        <p class="mt-4 font-semibold text-highlighted">Status and known issues</p>
        <p class="mt-1 text-sm text-muted">See what's being worked on before you report it again.</p>
      </NuxtLink>
    </section>

    <section class="mt-12 space-y-4" aria-labelledby="status-heading">
      <div class="flex items-end justify-between gap-3">
        <h2 id="status-heading" class="text-lg font-semibold text-highlighted">Current status</h2>
        <UButton to="/issues" variant="link" color="neutral" trailing-icon="i-lucide-arrow-right" label="All issues" size="sm" />
      </div>
      <PublicStatusBanner :status="overview.status" />
      <ul v-if="overview.status.latest.length" class="divide-y divide-default overflow-hidden rounded-xl bg-default ring ring-default">
        <li v-for="issue in overview.status.latest" :key="issue.reference">
          <NuxtLink :to="`/issues/${issue.reference}`" class="flex items-center gap-3 px-4 py-3 transition hover:bg-elevated/50">
            <UIcon :name="statusMeta[issue.status].icon" class="size-5 shrink-0 text-muted" />
            <span class="min-w-0 flex-1 truncate font-medium text-highlighted">{{ issue.title }}</span>
            <span class="hidden text-xs text-muted sm:inline">Updated <NuxtTime :datetime="issue.updatedAt" relative /></span>
            <TicketStatusBadge :status="issue.status" size="sm" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section class="mt-12 flex flex-col items-center gap-2 border-t border-default pt-8 text-center text-sm text-muted">
      <p>Have an account? Sign in to follow your tickets and get replies by email.</p>
      <div class="flex gap-2">
        <UButton to="/auth/login" label="Sign in" icon="i-lucide-log-in" color="neutral" variant="outline" />
        <UButton v-if="canRegister" to="/auth/register" label="Create an account" color="neutral" variant="ghost" />
      </div>
    </section>
  </div>
</template>
