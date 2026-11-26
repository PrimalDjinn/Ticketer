<script setup lang="ts">
/** Text people wrote, rendered as markdown. See utils/markdown.ts for what is allowed. */
const props = defineProps<{
  text: string
  /** Display names to highlight as @mentions. */
  mentions?: string[]
}>()

const html = computed(() => renderMarkdown(props.text, props.mentions))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown" v-html="html" />
</template>
