import { createConsola, type ConsolaReporter, type LogObject } from 'consola'

/**
 * Workers Logs index objects passed to `console.*` as searchable fields, while consola's default reporters print
 * ANSI-styled lines the Cloudflare dashboard shows as noise. On Workers we therefore emit one plain object per log.
 */
const workersReporter: ConsolaReporter = {
  log(entry: LogObject) {
    const [first, ...rest] = entry.args
    const error = [first, ...rest].find((a): a is Error => a instanceof Error)
    const record: Record<string, unknown> = {
      level: entry.type,
      tag: entry.tag || undefined,
      message: typeof first === 'string' ? first : error?.message ?? String(first ?? ''),
    }
    const extra = rest.filter((a) => a !== error)
    if (extra.length) record.data = extra.length === 1 ? extra[0] : extra
    if (error) record.error = { name: error.name, message: error.message, stack: error.stack }

    const write = entry.level <= 0 ? console.error : entry.level === 1 ? console.warn : entry.level >= 4 ? console.debug : console.log
    write(record)
  },
}

const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

export const logger = createConsola({
  level: import.meta.dev ? 4 : 3,
  ...(onWorkers ? { reporters: [workersReporter] } : {}),
})

/** A tagged logger, e.g. `useLogger('realtime').warn('publish failed', error)`. */
export function useLogger(tag: string) {
  return logger.withTag(tag)
}
