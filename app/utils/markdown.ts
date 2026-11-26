import MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type Token from 'markdown-it/lib/token.mjs'

/**
 * Markdown for text people write: ticket and task descriptions, comments, public issues. People outside the team and
 * GitHub write some of it, so:
 *  - raw HTML is never parsed (`html: false` escapes it), and markdown-it already refuses `javascript:`, `vbscript:`,
 *    `file:` and non-image `data:` URLs;
 *  - links open in a new tab without a referrer and are marked `nofollow ugc`;
 *  - only images on this site (`/files/…`) load; others become links, so a description can't plant a tracking pixel.
 * Line breaks are kept (`breaks`), so text written before markdown looks the same as it did.
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const { escapeHtml } = md.utils
const LINK_REL = 'noopener noreferrer nofollow ugc'

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx]!.attrSet('target', '_blank')
  tokens[idx]!.attrSet('rel', LINK_REL)
  return self.renderToken(tokens, idx, options)
}

const renderImage = md.renderer.rules.image!
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!
  const src = token.attrGet('src') ?? ''
  if (src.startsWith('/') && !src.startsWith('//')) {
    token.attrSet('loading', 'lazy')
    return renderImage(tokens, idx, options, env, self)
  }
  const alt = self.renderInlineAsText(token.children ?? [], options, env) || src
  return `<a href="${escapeHtml(src)}" target="_blank" rel="${LINK_REL}">${escapeHtml(alt)}</a>`
}

function textToken(state: StateCore, content: string) {
  const token = new state.Token('text', '', 0)
  token.content = content
  return token
}

function htmlToken(state: StateCore, content: string) {
  const token = new state.Token('html_inline', '', 0)
  token.content = content
  return token
}

/** `- [ ] item` and `- [x] item` (GitHub task lists) as read-only checkboxes. */
md.core.ruler.push('task_lists', (state) => {
  state.tokens.forEach((token, i) => {
    if (token.type !== 'inline' || state.tokens[i - 2]?.type !== 'list_item_open') return
    const first = token.children?.[0]
    const match = first?.type === 'text' ? /^\[([ xX])\]\s/.exec(first.content) : null
    if (!first || !match) return
    first.content = first.content.slice(match[0].length)
    const checked = match[1] !== ' '
    token.children!.unshift(htmlToken(state, `<input type="checkbox" disabled${checked ? ' checked' : ''} class="task-check"> `))
    state.tokens[i - 2]!.attrJoin('class', 'task-item')
  })
})

/** Highlights `@name` for the people passed in `env.mentions`, outside links and code. */
md.core.ruler.push('mentions', (state) => {
  const names: string[] = state.env?.mentions ?? []
  if (!names.length) return
  const escaped = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`@(?:${escaped.join('|')})(?!\\w)`, 'g')
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue
    const children: Token[] = []
    let inLink = 0
    for (const token of block.children) {
      if (token.type === 'link_open') inLink++
      if (token.type === 'link_close') inLink--
      if (token.type !== 'text' || inLink) {
        children.push(token)
        continue
      }
      let last = 0
      for (const match of token.content.matchAll(pattern)) {
        if (match.index > last) children.push(textToken(state, token.content.slice(last, match.index)))
        children.push(htmlToken(state, `<span class="mention">${escapeHtml(match[0])}</span>`))
        last = match.index + match[0].length
      }
      if (last === 0) children.push(token)
      else if (last < token.content.length) children.push(textToken(state, token.content.slice(last)))
    }
    block.children = children
  }
})

/** Safe HTML for `text`. `mentions` are display names to highlight as `@name`. */
export function renderMarkdown(text: string, mentions: string[] = []) {
  return md.render(text, { mentions })
}
