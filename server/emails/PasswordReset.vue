<script setup lang="ts">
import { Button } from '@vue-email/button'
import { Heading } from '@vue-email/heading'
import { Link } from '@vue-email/link'
import { Text } from '@vue-email/text'
import EmailLayout from './EmailLayout.vue'
import { button, fallbackLink, heading, paragraph, small } from './styles'
import type { MailBrand } from './styles'

defineProps<{ brand: MailBrand; link: string }>()
</script>

<template>
  <EmailLayout :brand="brand" :preview="`Choose a new ${brand.name} password`">
    <Heading as="h1" :style="heading">Reset your password</Heading>
    <Text :style="paragraph">Someone asked to reset your {{ brand.name }} password. The link below works for one hour.</Text>
    <Button :href="link" :style="{ ...button, backgroundColor: brand.color }">Choose a new password</Button>
    <Text class="html-only" :style="small">If the button doesn't work, open this link: <Link :href="link" :style="{ ...fallbackLink, color: brand.color }">{{ link }}</Link></Text>
    <template #footer>If this wasn't you, ignore this email; your password stays the same.</template>
  </EmailLayout>
</template>
