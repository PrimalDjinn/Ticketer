<script setup lang="ts">
import { Heading } from '@vue-email/heading'
import { Text } from '@vue-email/text'
import EmailLayout from './EmailLayout.vue'
import { heading, paragraph } from './styles'

defineProps<{ appName: string }>()
</script>

<template>
  <EmailLayout :app-name="appName" preview="Email is set up correctly">
    <Heading as="h1" :style="heading">Email works</Heading>
    <Text :style="{ ...paragraph, margin: '0' }">This is a test message from {{ appName }}. If you can read it, email is set up correctly.</Text>
    <template #footer>Sent from Settings → Email.</template>
  </EmailLayout>
</template>
