/** Display helpers for custom fields and repeating tasks. */

export const fieldTypeMeta: Record<FieldType, { label: string; icon: string }> = {
  text: { label: 'Text', icon: 'i-lucide-type' },
  number: { label: 'Number', icon: 'i-lucide-hash' },
  date: { label: 'Date', icon: 'i-lucide-calendar' },
  select: { label: 'Select', icon: 'i-lucide-circle-chevron-down' },
  multiselect: { label: 'Multi-select', icon: 'i-lucide-list-checks' },
  checkbox: { label: 'Checkbox', icon: 'i-lucide-square-check' },
}

export const repeatMeta: Record<TaskRepeat, { label: string }> = {
  daily: { label: 'Daily' },
  weekly: { label: 'Weekly' },
  monthly: { label: 'Monthly' },
  yearly: { label: 'Yearly' },
  periodically: { label: 'Every N days' },
}

export const REPEAT_HINT = 'Next one is created when this moves to a done column'

/** "Weekly", "Every 3 days", or "" when the task does not repeat. */
export function repeatLabel(repeat: TaskRepeat | null, interval: number | null) {
  if (!repeat) return ''
  if (repeat === 'periodically') return interval === 1 ? 'Every day' : `Every ${interval ?? 1} days`
  return repeatMeta[repeat].label
}

export function isEmptyFieldValue(value: FieldValue | null | undefined) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

/** Human-readable value, for read-only places. */
export function formatFieldValue(field: FieldDTO, value: FieldValue | null | undefined) {
  if (isEmptyFieldValue(value)) return ''
  if (field.type === 'checkbox') return value ? 'Yes' : 'No'
  if (field.type === 'date' && typeof value === 'string') return formatDay(value)
  return Array.isArray(value) ? value.join(', ') : String(value)
}
