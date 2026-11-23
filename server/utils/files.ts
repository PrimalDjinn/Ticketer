import type { H3Event } from 'h3'
import { blob } from 'hub:blob'
import { db, schema } from 'hub:db'
import { inArray } from 'drizzle-orm'
import { ulid } from 'ulid'

type Owner = { ticketId: number } | { commentId: number } | { messageId: number }

/** Reads every `File` sent under `field` in a multipart body, plus the plain text fields. */
export async function readMultipart(event: H3Event, field = 'files') {
  const form = await readFormData(event)
  const files = form.getAll(field).filter((v): v is File => typeof v !== 'string' && v.size > 0)
  if (files.length > UPLOAD_LIMITS.maxFiles) {
    throw createError({ status: 400, message: `Attach at most ${UPLOAD_LIMITS.maxFiles} files` })
  }
  for (const file of files) {
    ensureBlob(file, { maxSize: UPLOAD_LIMITS.maxSize })
  }
  const text = (name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : undefined
  }
  return { files, text, form }
}

function safeName(name: string) {
  const cleaned = name.normalize('NFKC').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(-120)
  return cleaned || 'file'
}

/**
 * Stores files in blob storage under `folder/` and records them as attachments of `owner`. Blobs are written first;
 * if recording fails they are removed again so storage never holds orphans the database does not know about.
 */
export async function storeAttachments(folder: string, files: File[], owner: Owner, uploaderId: string) {
  if (!files.length) return []
  const stored: (typeof schema.attachments.$inferInsert)[] = []
  try {
    for (const file of files) {
      const contentType = file.type || 'application/octet-stream'
      const pathname = `${folder}/${ulid()}-${safeName(file.name)}`
      await blob.put(pathname, file, { contentType })
      stored.push({ pathname, name: file.name || 'file', contentType, size: file.size, uploaderId, ...owner })
    }
    return await db.insert(schema.attachments).values(stored).returning()
  } catch (error) {
    await blob.del(stored.map((s) => s.pathname)).catch(() => {})
    throw error
  }
}

export async function deleteBlobs(pathnames: string[]) {
  if (pathnames.length) await blob.del(pathnames).catch((error) => useLogger('files').error('blob delete failed', error))
}

export function toAttachmentDTO(a: typeof schema.attachments.$inferSelect): AttachmentDTO {
  return {
    id: a.id,
    name: a.name,
    contentType: a.contentType,
    size: a.size,
    url: `/files/${a.id}/${encodeURIComponent(a.name)}`,
    createdAt: a.createdAt,
  }
}

export async function attachmentsFor(column: 'ticketId' | 'commentId' | 'messageId', ids: number[]) {
  const map = new Map<number, AttachmentDTO[]>()
  if (!ids.length) return map
  const rows = await db.select().from(schema.attachments).where(inArray(schema.attachments[column], ids))
  for (const row of rows) {
    const key = row[column]!
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(toAttachmentDTO(row))
  }
  return map
}
