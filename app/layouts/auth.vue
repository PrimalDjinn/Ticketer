<template>
  <div class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-default px-4 py-12">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--ui-color-primary-500)/12%,transparent_60%)]" />
    <div class="relative w-full max-w-sm">
      <NuxtLink to="/" class="mb-8 flex items-center justify-center font-semibold text-highlighted">
        <BrandMark size="lg" />
      </NuxtLink>
      <UCard variant="subtle" class="shadow-lg">
        <slot />
      </UCard>
    </div>
    <ChatWidget />
  </div>
</template>
