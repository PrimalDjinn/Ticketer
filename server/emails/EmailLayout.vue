<script setup lang="ts">
/** Shared frame for every email: the organisation's logo or name, a white card, and a quiet footer. Inline styles only. */
import { Body } from '@vue-email/body'
import { Container } from '@vue-email/container'
import { Head } from '@vue-email/head'
import { Hr } from '@vue-email/hr'
import { Html } from '@vue-email/html'
import { Preview } from '@vue-email/preview'
import { Section } from '@vue-email/section'
import { Text } from '@vue-email/text'

import type { MailBrand } from './styles'

defineProps<{ brand: MailBrand; preview: string }>()

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
</script>

<template>
  <Html lang="en">
    <Head />
    <Preview>{{ preview }}</Preview>
    <Body :style="{ margin: '0', padding: '32px 12px', backgroundColor: '#f4f4f5', fontFamily: font, color: '#18181b' }">
      <Container :style="{ maxWidth: '480px', margin: '0 auto' }">
        <img v-if="brand.logoUrl" :src="brand.logoUrl" :alt="brand.name" height="32" :style="{ display: 'block', height: '32px', width: 'auto', margin: '0 0 16px', border: '0' }" />
        <Text v-else :style="{ margin: '0 0 16px', fontSize: '15px', fontWeight: '600', color: brand.color }">{{ brand.name }}</Text>
        <Section :style="{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '32px', border: '1px solid #e4e4e7' }">
          <slot />
        </Section>
        <Hr :style="{ border: 'none', margin: '16px 0 0' }" />
        <Text :style="{ margin: '0', fontSize: '12px', lineHeight: '18px', color: '#71717a' }">
          <slot name="footer" />
        </Text>
      </Container>
    </Body>
  </Html>
</template>
