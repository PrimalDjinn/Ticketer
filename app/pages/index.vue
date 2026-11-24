<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { internal } = useAccess()
useSeoMeta({ title: () => (internal.value ? 'Dashboard · Ticketer' : 'Home · Ticketer') })
</script>

<template>
  <HomeTeam v-if="internal" />
  <HomeCustomer v-else />
</template>
