import type { CommentNode } from '~/components/CommentItem.vue'

/** Builds the reply tree from a flat, chronologically ordered comment list. */
export function commentTree(list: CommentDTO[]): CommentNode[] {
  const nodes = new Map<number, CommentNode>()
  for (const c of list) nodes.set(c.id, { ...c, replies: [] })
  const roots: CommentNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.replies.push(node)
    else roots.push(node)
  }
  return roots
}

/** Ids of a comment and every reply below it (they are deleted together). */
export function commentThreadIds(list: { id: number; parentId: number | null }[], rootId: number) {
  const ids = new Set([rootId])
  for (let grew = true; grew; ) {
    grew = false
    for (const c of list) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) (ids.add(c.id), (grew = true))
  }
  return ids
}
