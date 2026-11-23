/**
 * Resilient realtime client.
 *
 * Tries WebSocket first, then Server-Sent Events, then long polling, and keeps the connection alive across network
 * drops with exponential backoff. Listeners are registered once and survive transport switches. When a connection
 * comes back after a gap, a `resync` event fires so screens can refetch anything they missed: realtime delivery is
 * best-effort, the REST API is the source of truth.
 */

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

type Listener = (event: RealtimeEvent) => void
type Meta = 'status' | 'resync'

interface Transport {
  kind: RealtimeTransport
  close(): void
}

interface TransportCallbacks {
  onOpen(): void
  onEvent(event: RealtimeEvent): void
  onDrop(reason: string): void
}

const ORDER: RealtimeTransport[] = ['websocket', 'sse', 'poll']
const OPEN_TIMEOUT_MS = 8_000
const UPGRADE_RETRY_MS = 5 * 60_000
const KEEPALIVE_MS = 25_000

function parse(data: unknown): RealtimeEvent | null {
  if (typeof data !== 'string' || data === 'pong') return null
  try {
    const value = JSON.parse(data)
    return value && typeof value.type === 'string' ? (value as RealtimeEvent) : null
  } catch {
    return null
  }
}

function openWebSocket(cb: TransportCallbacks): Transport {
  const url = new URL('/_realtime/ws', location.href)
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(url)
  let keepalive: ReturnType<typeof setInterval> | undefined
  let closed = false

  ws.onopen = () => {
    keepalive = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), KEEPALIVE_MS)
  }
  ws.onmessage = (message) => {
    const event = parse(message.data)
    if (!event) return
    if (event.type === 'hello') cb.onOpen()
    cb.onEvent(event)
  }
  ws.onclose = (event) => {
    clearInterval(keepalive)
    if (!closed) cb.onDrop(`websocket closed (${event.code})`)
  }
  return {
    kind: 'websocket',
    close() {
      closed = true
      clearInterval(keepalive)
      ws.close()
    },
  }
}

function openEventSource(cb: TransportCallbacks): Transport {
  const source = new EventSource('/_realtime/sse', { withCredentials: true })
  let closed = false
  source.onmessage = (message) => {
    const event = parse(message.data)
    if (!event) return
    if (event.type === 'hello') cb.onOpen()
    cb.onEvent(event)
  }
  source.onerror = () => {
    // EventSource retries on its own, but we want our backoff and transport ladder to decide.
    source.close()
    if (!closed) cb.onDrop('event stream error')
  }
  return {
    kind: 'sse',
    close() {
      closed = true
      source.close()
    },
  }
}

function openLongPoll(cb: TransportCallbacks): Transport {
  const controller = new AbortController()
  let clientId: string | undefined
  let closed = false

  ;(async () => {
    while (!closed) {
      try {
        const events = await $fetch<string[]>('/_realtime/poll', {
          query: clientId ? { client: clientId } : {},
          signal: controller.signal,
          timeout: 40_000,
        })
        for (const raw of events) {
          const event = parse(raw)
          if (!event) continue
          if (event.type === 'hello') {
            clientId = event.body.clientId
            cb.onOpen()
          }
          cb.onEvent(event)
        }
      } catch (error) {
        if (!closed) cb.onDrop(`poll failed: ${(error as Error).message}`)
        return
      }
    }
  })()

  return {
    kind: 'poll',
    close() {
      closed = true
      controller.abort()
    },
  }
}

const OPENERS: Record<RealtimeTransport, (cb: TransportCallbacks) => Transport> = {
  websocket: openWebSocket,
  sse: openEventSource,
  poll: openLongPoll,
}

export class RealTime {
  status: RealtimeStatus = 'idle'
  transport: RealtimeTransport | null = null

  private listeners = new Map<string, Set<Listener>>()
  private meta = new Map<Meta, Set<() => void>>()
  private current: Transport | null = null
  private level = 0
  private attempt = 0
  private everOpened = false
  private openTimer?: ReturnType<typeof setTimeout>
  private retryTimer?: ReturnType<typeof setTimeout>
  private upgradeTimer?: ReturnType<typeof setTimeout>
  private stopped = true

  constructor() {
    if (typeof window === 'undefined') return
    window.addEventListener('online', () => this.reconnectSoon())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.status === 'reconnecting') this.reconnectSoon()
    })
  }

  /** Subscribe to one event type (or `*` for all). Returns an unsubscribe function. */
  on<T extends RealtimeEventType | '*'>(
    type: T,
    listener: (event: T extends '*' ? RealtimeEvent : Extract<RealtimeEvent, { type: T }>) => void,
  ) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener as Listener)
    return () => this.listeners.get(type)?.delete(listener as Listener)
  }

  onMeta(type: Meta, listener: () => void) {
    if (!this.meta.has(type)) this.meta.set(type, new Set())
    this.meta.get(type)!.add(listener)
    return () => this.meta.get(type)?.delete(listener)
  }

  connect() {
    if (typeof window === 'undefined') return
    this.stopped = false
    this.level = 0
    this.attempt = 0
    this.open()
  }

  /** Drop the connection and start over, e.g. after signing in or out. */
  restart() {
    this.disconnect()
    this.connect()
  }

  disconnect() {
    this.stopped = true
    this.teardown()
    clearTimeout(this.retryTimer)
    clearTimeout(this.upgradeTimer)
    this.setStatus('closed')
  }

  private open() {
    this.teardown()
    const kind = ORDER[this.level]!
    this.setStatus(this.everOpened ? 'reconnecting' : 'connecting')
    let opened = false

    const transport = OPENERS[kind]({
      onOpen: () => {
        if (opened || this.current !== transport) return
        opened = true
        clearTimeout(this.openTimer)
        const wasGap = this.everOpened
        this.everOpened = true
        this.attempt = 0
        this.transport = kind
        this.setStatus('open')
        if (wasGap) this.emitMeta('resync')
        if (this.level > 0) this.scheduleUpgrade()
      },
      onEvent: (event) => this.dispatch(event),
      onDrop: (reason) => {
        if (this.current !== transport) return
        console.warn(`[realtime] ${kind}: ${reason}`)
        // A transport that never opened is unusable here (proxy, firewall): step down the ladder.
        this.fail(!opened)
      },
    })
    this.current = transport
    this.openTimer = setTimeout(() => {
      if (!opened && this.current === transport) {
        console.warn(`[realtime] ${kind}: no answer in ${OPEN_TIMEOUT_MS / 1000}s`)
        this.fail(true)
      }
    }, OPEN_TIMEOUT_MS)
  }

  private fail(stepDown: boolean) {
    this.teardown()
    if (this.stopped) return
    if (stepDown && this.level < ORDER.length - 1) {
      this.level++
      this.open()
      return
    }
    if (stepDown) this.level = 0 // every transport failed: start the ladder again after backing off
    this.setStatus('reconnecting')
    const delay = Math.min(30_000, 1_000 * 2 ** this.attempt++) * (0.7 + Math.random() * 0.6)
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => this.open(), delay)
  }

  /** On a fallback transport, try WebSocket again every few minutes in case the obstacle went away. */
  private scheduleUpgrade() {
    clearTimeout(this.upgradeTimer)
    this.upgradeTimer = setTimeout(() => {
      if (this.stopped || this.level === 0) return
      let answered = false
      const probe = openWebSocket({
        onOpen: () => {
          answered = true
          probe.close()
          console.info('[realtime] websocket reachable again, upgrading')
          this.level = 0
          this.open()
        },
        onEvent: () => {},
        onDrop: () => this.scheduleUpgrade(),
      })
      setTimeout(() => {
        if (answered) return
        probe.close()
        this.scheduleUpgrade()
      }, OPEN_TIMEOUT_MS)
    }, UPGRADE_RETRY_MS)
  }

  private reconnectSoon() {
    if (this.stopped || this.status === 'open') return
    clearTimeout(this.retryTimer)
    this.attempt = 0
    this.level = 0
    this.open()
  }

  private teardown() {
    clearTimeout(this.openTimer)
    const current = this.current
    this.current = null
    this.transport = null
    current?.close()
  }

  private dispatch(event: RealtimeEvent) {
    for (const key of [event.type, '*']) {
      for (const listener of this.listeners.get(key) ?? []) {
        try {
          listener(event)
        } catch (error) {
          console.error('[realtime] listener failed', error)
        }
      }
    }
  }

  private setStatus(status: RealtimeStatus) {
    if (this.status === status) return
    this.status = status
    this.emitMeta('status')
  }

  private emitMeta(type: Meta) {
    for (const listener of this.meta.get(type) ?? []) listener()
  }
}
