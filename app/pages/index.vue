<script setup lang="ts">
// Visitors who aren't signed in (and guest sessions) get the public help page; everyone else their dashboard.
definePageMeta({
  middleware: [
    () => {
      const { loggedIn, user } = useUserSession()
      if (!loggedIn.value || user.value?.isGuest) setPageLayout('public')
    },
  ],
})
const { internal, registered } = useAccess()
useSeoMeta({ title: () => (!registered.value ? undefined : internal.value ? 'Dashboard' : 'Home') })
</script>

<template>
  <HomePublic v-if="!registered" />
  <HomeTeam v-else-if="internal" />
  <HomeCustomer v-else />
</template>
