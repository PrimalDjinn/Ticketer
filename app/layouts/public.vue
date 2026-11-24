<script setup lang="ts">
/** Pages anyone can open without an account (the public issues page). No sidebar; a slim header and footer. */
const { loggedIn, registered } = useAccess()
const route = useRoute()
const appName = useRuntimeConfig().public.appName || 'Ticketer'
const colorMode = useColorMode()
const signInLink = computed(() => ({ path: '/auth/login', query: { redirect: route.fullPath } }))
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-default">
    <header class="sticky top-0 z-30 border-b border-default bg-default/85 backdrop-blur">
      <div class="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <NuxtLink to="/issues" class="flex min-w-0 items-center gap-2 font-semibold text-highlighted">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-inverted">
            <UIcon name="i-lucide-ticket-check" class="size-5" />
          </span>
          <span class="truncate text-lg tracking-tight">{{ appName }}</span>
          <span class="hidden text-sm font-normal text-muted sm:inline">· Issues</span>
        </NuxtLink>
        <div class="ml-auto flex items-center gap-1 sm:gap-2">
          <IntegrationsBackLink class="hidden sm:flex" />
          <ClientOnly>
            <UButton
              :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
              color="neutral"
              variant="ghost"
              :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
              @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
            />
          </ClientOnly>
          <UButton to="/tickets/new" icon="i-lucide-square-pen" color="neutral" variant="outline" class="hidden sm:inline-flex" label="Report an issue" />
          <UButton to="/tickets/new" icon="i-lucide-square-pen" color="neutral" variant="ghost" class="sm:hidden" aria-label="Report an issue" />
          <UButton v-if="loggedIn && registered" to="/" icon="i-lucide-layout-dashboard" label="Open app" />
          <UButton v-else :to="signInLink" icon="i-lucide-log-in" label="Sign in" />
        </div>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-default">
      <div class="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted">
        <span>{{ appName }} · public issue tracker</span>
        <span class="flex items-center gap-3">
          <NuxtLink to="/issues" class="hover:text-highlighted">All issues</NuxtLink>
          <NuxtLink to="/tickets/new" class="hover:text-highlighted">Report an issue</NuxtLink>
        </span>
      </div>
    </footer>

    <ClientOnly>
      <ChatWidget />
    </ClientOnly>
  </div>
</template>
