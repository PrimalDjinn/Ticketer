<script setup lang="ts">
import { Button } from '@vue-email/button'
import { Heading } from '@vue-email/heading'
import { Link } from '@vue-email/link'
import { Text } from '@vue-email/text'
import EmailLayout from './EmailLayout.vue'
import { button, fallbackLink, heading, paragraph, small } from './styles'

defineProps<{ appName: string; link: string }>()
</script>

<template>
  <EmailLayout :app-name="appName" :preview="`Choose a new ${appName} password`">
    <Heading as="h1" :style="heading">Reset your password</Heading>
    <Text :style="paragraph">Someone asked to reset your {{ appName }} password. The link below works for one hour.</Text>
    <Button :href="link" :style="button">Choose a new password</Button>
    <Text class="html-only" :style="small">If the button doesn't work, open this link: <Link :href="link" :style="fallbackLink">{{ link }}</Link></Text>
    <template #footer>If this wasn't you, ignore this email; your password stays the same.</template>
  </EmailLayout>
</template>
