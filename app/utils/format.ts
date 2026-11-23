type DateLike = string | number | Date | null | undefined

export function toDate(value: DateLike) {
  return value == null ? null : new Date(value)
}

export function formatDateTime(value: DateLike) {
  const date = toDate(value)
  return date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

export function formatDate(value: DateLike) {
  const date = toDate(value)
  return date ? date.toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

export function shortRef(reference: string) {
  return reference.slice(-8)
}

type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

export const statusMeta: Record<TicketStatus, { color: BadgeColor; icon: string; label: string }> = {
  Open: { color: 'info', icon: 'i-lucide-circle-dot', label: 'Open' },
  Pending: { color: 'warning', icon: 'i-lucide-loader-circle', label: 'Pending' },
  Resolved: { color: 'success', icon: 'i-lucide-circle-check', label: 'Resolved' },
  Closed: { color: 'neutral', icon: 'i-lucide-circle-x', label: 'Closed' },
}

export const urgencyMeta: Record<TicketUrgency, { color: BadgeColor; label: string }> = {
  Default: { color: 'neutral', label: 'Normal' },
  Urgent: { color: 'warning', label: 'Urgent' },
  Emergency: { color: 'error', label: 'Emergency' },
}

export function isImage(contentType: string) {
  return /^image\/(png|jpe?g|gif|webp|avif)$/.test(contentType)
}

export function fileIcon(contentType: string) {
  if (isImage(contentType)) return 'i-lucide-image'
  if (contentType === 'application/pdf') return 'i-lucide-file-text'
  if (contentType.startsWith('video/')) return 'i-lucide-file-video'
  if (contentType.startsWith('audio/')) return 'i-lucide-file-audio'
  if (/sheet|excel|csv/.test(contentType)) return 'i-lucide-file-spreadsheet'
  if (/zip|compressed|tar/.test(contentType)) return 'i-lucide-file-archive'
  return 'i-lucide-file'
}

export function initials(name: string) {
  return name
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

/** Error message from a failed $fetch, falling back to a generic one. */
export function errorMessage(error: unknown, fallback = 'Something went wrong') {
  const e = error as { data?: { message?: string; statusMessage?: string }; message?: string }
  return e?.data?.message || e?.data?.statusMessage || fallback
}
