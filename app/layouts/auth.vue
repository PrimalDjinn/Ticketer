<template>
  <div class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-default px-4 py-12">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--ui-color-primary-500)/12%,transparent_60%)]" />
    <div class="relative w-full max-w-sm">
      <NuxtLink to="/" class="mb-8 flex items-center justify-center gap-2 font-semibold text-highlighted">
        <span class="grid size-9 place-items-center rounded-lg bg-primary text-inverted">
          <UIcon name="i-lucide-ticket-check" class="size-5" />
        </span>
        <span class="text-xl tracking-tight">Ticketer</span>
      </NuxtLink>
      <UCard variant="subtle" class="shadow-lg">
        <slot />
      </UCard>
    </div>
    <ChatWidget />
  </div>
</template>
