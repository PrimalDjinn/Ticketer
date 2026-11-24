<script setup lang="ts">
import { Button } from '@vue-email/button'
import { Link } from '@vue-email/link'
import { Text } from '@vue-email/text'
import EmailLayout from './EmailLayout.vue'
import { button, paragraph } from './styles'

defineProps<{ appName: string; message: string; link: string; settingsLink: string }>()
</script>

<template>
  <EmailLayout :app-name="appName" :preview="message">
    <Text :style="{ ...paragraph, fontSize: '16px', color: '#18181b' }">{{ message }}</Text>
    <Button :href="link" :style="button">Open in {{ appName }}</Button>
    <template #footer>
      You get these emails because notification emails are on for your account.
      <Link :href="settingsLink" :style="{ color: '#71717a', textDecoration: 'underline' }">Turn them off</Link>.
    </template>
  </EmailLayout>
</template>
