export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      neutral: 'zinc',
    },
    // Markdown in descriptions and comments (<MDC>): Nuxt UI's prose is sized for documentation pages, so tighten it
    // to read like a comment thread.
    prose: {
      p: { base: 'my-2 leading-6' },
      ul: { base: 'my-2 ps-5' },
      ol: { base: 'my-2 ps-5' },
      // Checklist items (- [ ] …) show their checkbox instead of a bullet.
      li: { base: 'my-0.5 ps-1 leading-6 has-[>input]:list-none [&>input]:me-1.5 [&>ol]:my-0 [&>ul]:my-0' },
      h1: { slots: { base: 'mt-4 mb-2 text-lg font-semibold' } },
      h2: { slots: { base: 'mt-4 mb-2 text-base font-semibold' } },
      h3: { slots: { base: 'mt-3 mb-1.5 text-sm font-semibold' } },
      h4: { slots: { base: 'mt-3 mb-1.5 text-sm font-semibold' } },
      blockquote: { base: 'my-2 not-italic text-muted' },
      hr: { base: 'my-4' },
      pre: { slots: { root: 'my-2' } },
      table: { slots: { root: 'my-2' } },
    },
  },
})
