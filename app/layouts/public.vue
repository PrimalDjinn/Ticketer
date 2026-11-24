<script setup lang="ts">
/** Pages anyone can open without an account (the public issues page). No sidebar; a slim header and footer. */
const { loggedIn, registered } = useAccess()
const route = useRoute()
const { site } = useSite()
const colorMode = useColorMode()
const signInLink = computed(() => ({ path: '/auth/login', query: { redirect: route.fullPath } }))

// A toast whenever an issue is made public.
useNewPublicIssueToasts()
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-default">
    <header class="sticky top-0 z-30 border-b border-default bg-default/85 backdrop-blur">
      <div class="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <NuxtLink to="/" class="flex min-w-0 items-center gap-2 font-semibold text-highlighted">
          <BrandMark />
          <span class="hidden text-sm font-normal text-muted sm:inline">· Help</span>
        </NuxtLink>
        <nav class="ml-2 hidden items-center gap-1 md:flex" aria-label="Help pages">
          <UButton to="/" label="Get help" color="neutral" variant="ghost" size="sm" :active="route.path === '/'" active-variant="soft" />
          <UButton to="/issues" label="Status and issues" color="neutral" variant="ghost" size="sm" :active="route.path.startsWith('/issues')" active-variant="soft" />
        </nav>
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
        <span class="flex items-center gap-3">
          <span>{{ site.name }} · help and status</span>
          <a v-if="site.website" :href="site.website" class="inline-flex items-center gap-1 hover:text-highlighted" rel="noopener">
            {{ site.website.replace(/^https?:\/\//, '').replace(/\/$/, '') }}
            <UIcon name="i-lucide-arrow-up-right" class="size-3" />
          </a>
        </span>
        <span class="flex items-center gap-3">
          <NuxtLink to="/" class="hover:text-highlighted">Get help</NuxtLink>
          <NuxtLink to="/issues" class="hover:text-highlighted">Status and issues</NuxtLink>
          <NuxtLink to="/tickets/new" class="hover:text-highlighted">Report an issue</NuxtLink>
        </span>
      </div>
    </footer>

    <ClientOnly>
      <ChatWidget />
    </ClientOnly>
  </div>
</template>
