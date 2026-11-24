<script setup lang="ts">
import { Button } from '@vue-email/button'
import { Heading } from '@vue-email/heading'
import { Link } from '@vue-email/link'
import { Text } from '@vue-email/text'
import EmailLayout from './EmailLayout.vue'
import { button, fallbackLink, heading, paragraph, small } from './styles'

defineProps<{ appName: string; link: string; inviter: string | null; rolePhrase: string; days: number }>()
</script>

<template>
  <EmailLayout :app-name="appName" :preview="`${inviter ?? 'Someone'} invited you to ${appName}`">
    <Heading as="h1" :style="heading">Join {{ appName }}</Heading>
    <Text :style="paragraph">
      {{ inviter ? `${inviter} invited you` : 'You have been invited' }} to join as {{ rolePhrase }}. The link works for {{ days }} days.
    </Text>
    <Button :href="link" :style="button">Accept the invitation</Button>
    <Text class="html-only" :style="small">If the button doesn't work, open this link: <Link :href="link" :style="fallbackLink">{{ link }}</Link></Text>
    <template #footer>If you weren't expecting this, you can ignore this email.</template>
  </EmailLayout>
</template>
