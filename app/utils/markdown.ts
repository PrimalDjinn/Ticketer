import remarkBreaks from 'remark-breaks'

/**
 * `parserOptions` for `<MDC>` on text people write: descriptions, comments, public issues. People outside the team and
 * GitHub write some of it, so MDC's features for trusted content are off:
 *  - no raw HTML (`<style>`, `<iframe>`, `<form>`… are dropped), and no MDC component syntax (`::card`, `:badge`);
 *  - links open in a new tab, without a referrer.
 * MDC itself still drops `on*` attributes and `javascript:` links. Single line breaks are kept, as on GitHub.
 */
export const userMarkdown = {
  remark: {
    plugins: {
      'remark-mdc': false,
      'remark-breaks': { instance: remarkBreaks },
    },
  },
  rehype: {
    options: { allowDangerousHtml: false },
    plugins: {
      'rehype-raw': false,
      'rehype-external-links': { options: { target: '_blank', rel: ['noopener', 'noreferrer', 'nofollow', 'ugc'] } },
    },
  },
  toc: false,
} as const

/** `@name` of the people given, in bold, outside code. */
export function boldMentions(text: string, names: string[]) {
  if (!names.length) return text
  const escaped = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`@(?:${escaped.join('|')})(?![\\w])`, 'g')
  // Odd parts are code (fenced blocks or inline spans) and stay as written.
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(pattern, '**$&**')))
    .join('')
}
