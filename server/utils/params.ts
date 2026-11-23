import { z } from 'zod'

const id = z.coerce.number().int().positive()

/** Route params for `/[id]` routes. */
export const idParams = z.object({ id })
/** Route params for `/tickets/[id]/comments/[commentId]`. */
export const commentParams = z.object({ id, commentId: id })
/** Route params for `/chats/[chatId]`. */
export const chatParams = z.object({ chatId: z.string().min(1).max(80) })
