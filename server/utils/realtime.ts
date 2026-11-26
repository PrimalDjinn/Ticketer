/**
 * Realtime hub: one publish API over three transports (WebSocket, Server-Sent Events, long polling).
 *
 * Where connections live:
 *  - Node/Bun: everything is in this process.
 *  - Cloudflare (cloudflare-durable preset): every realtime connection is forwarded into a single Durable Object
 *    instance (see server/middleware/realtime.ts), so it is the one place that holds connections. API routes run in
 *    the Worker and hand their events to the Durable Object with `durableFetch` (see `publish`).
 *
 * WebSockets inside the Durable Object use hibernation: in-memory state can disappear between messages, so their
 * channels are stored on the socket attachment and fan-out reads `ctx.getWebSockets()` instead of a local map.
 */
import type { H3Event } from 'h3'
import type { Peer } from 'crossws'
import { ulid } from 'ulid'

const log = useLogger('realtime')

type Channel = string

interface Sink {
  id: string
  userId: string
  channels: Set<Channel>
  transport: RealtimeTransport
  send: (data: string) => boolean
  close: () => void
}

interface PollQueue {
  sink: Sink
  queue: string[]
  waiter?: (events: string[]) => void
  lastSeen: number
}

/** Minimal view of the Durable Object the Nitro runtime hands us. */
interface DurableLike {
  ctx: {
    getWebSockets(): Array<{
      send(data: string): void
      deserializeAttachment(): { t?: Set<string> } | null
    }>
  }
}

const sinks = new Map<string, Sink>()
const polls = new Map<string, PollQueue>()
let heartbeat: ReturnType<typeof setInterval> | undefined

const POLL_HOLD_MS = 25_000
const POLL_EXPIRE_MS = 70_000
const HEARTBEAT_MS = 25_000

type ChannelUser = { id: string; isAdmin: boolean; isGuest?: boolean; role: UserRole }

/** Internal people hear project, task, ticket and inbox activity; everyone else only what is addressed to them. */
export function channelsFor(user: ChannelUser) {
  const list = [channels.all, channels.user(user.id)]
  if (isInternal(user)) list.push(channels.members)
  if (user.isAdmin) list.push(channels.admins)
  return list
}

export function encode(event: RealtimeEvent) {
  return JSON.stringify(event)
}

// ---------------------------------------------------------------------------------------------------------------------
// Local delivery (process memory on Node, Durable Object memory on Cloudflare)
// ---------------------------------------------------------------------------------------------------------------------

function ensureHeartbeat() {
  if (heartbeat || !sinks.size) return
  heartbeat = setInterval(() => {
    const ping = encode({ type: 'ping', body: Date.now() })
    for (const sink of sinks.values()) {
      if (sink.transport !== 'poll' && !sink.send(ping)) removeSink(sink.id)
    }
    const now = Date.now()
    for (const [id, poll] of polls) {
      if (!poll.waiter && now - poll.lastSeen > POLL_EXPIRE_MS) removeSink(id)
    }
    if (!sinks.size) {
      clearInterval(heartbeat)
      heartbeat = undefined
    }
  }, HEARTBEAT_MS)
}

function addSink(sink: Sink) {
  sinks.set(sink.id, sink)
  ensureHeartbeat()
  return sink
}

export function removeSink(id: string) {
  const sink = sinks.get(id)
  if (!sink) return
  sinks.delete(id)
  const poll = polls.get(id)
  if (poll) {
    poll.waiter?.([])
    polls.delete(id)
  }
  try {
    sink.close()
  } catch {}
}

function deliverLocal(targets: Channel[], data: string) {
  for (const sink of sinks.values()) {
    if (targets.some((c) => sink.channels.has(c)) && !sink.send(data)) removeSink(sink.id)
  }
}

function deliverDurableSockets(durable: DurableLike, targets: Channel[], data: string) {
  for (const ws of durable.ctx.getWebSockets()) {
    const topics = ws.deserializeAttachment()?.t
    if (!topics || !targets.some((c) => topics.has(c))) continue
    try {
      ws.send(data)
    } catch {}
  }
}

/** Delivers to connections held by this runtime. Called directly on Node, or inside the Durable Object. */
export function deliver(targets: Channel[], data: string, durable?: DurableLike) {
  if (durable) deliverDurableSockets(durable, targets, data)
  deliverLocal(targets, data)
}

// ---------------------------------------------------------------------------------------------------------------------
// Publishing from API routes
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Publishes an event to one or more channels. Never throws: realtime is best-effort and every client refetches
 * authoritative state from the API after reconnecting.
 */
export function publish(event: H3Event, targets: Channel | Channel[], payload: RealtimeEvent) {
  const list = Array.isArray(targets) ? targets : [targets]
  const data = encode(payload)
  const cf = event.context.cloudflare as
    | { durable?: DurableLike; durableFetch?: (req: Request) => Promise<Response> }
    | undefined

  // What the team hears is also the event log (webhooks, /api/v1/events). Not inside the Durable Object: there it's
  // only fanning out what the Worker already recorded.
  if (!cf?.durable && list.includes(channels.members)) recordRealtime(event, payload)

  if (cf?.durable) return deliver(list, data, cf.durable)

  if (cf?.durableFetch) {
    const request = new Request('https://realtime.internal/_realtime/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channels: list, data }),
    })
    const task = cf
      .durableFetch(request)
      .then((res) => {
        if (!res.ok) log.error('publish rejected by durable object', { status: res.status })
      })
      .catch((error) => log.error('publish failed', error))
    event.waitUntil(task)
    return
  }

  deliver(list, data)
}

// ---------------------------------------------------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------------------------------------------------

export function durableOf(peer: Peer): DurableLike | undefined {
  return (peer as unknown as { _internal?: { durable?: DurableLike } })._internal?.durable
}

export function attachWebSocket(peer: Peer, user: ChannelUser) {
  const list = channelsFor(user)
  const durable = durableOf(peer)
  if (durable) {
    // Hibernation-safe: crossws persists topics on the socket attachment.
    for (const channel of list) peer.subscribe(channel)
  } else {
    addSink({
      id: peer.id,
      userId: user.id,
      channels: new Set(list),
      transport: 'websocket',
      send: (data) => {
        try {
          peer.send(data)
          return true
        } catch {
          return false
        }
      },
      close: () => {},
    })
  }
  peer.send(encode({ type: 'hello', body: { clientId: peer.id, transport: 'websocket' } }))
}

export function openEventStream(event: H3Event, user: ChannelUser) {
  const stream = createEventStream(event)
  const id = ulid()
  const sink = addSink({
    id,
    userId: user.id,
    channels: new Set(channelsFor(user)),
    transport: 'sse',
    send: (data) => {
      stream.push(data).catch(() => removeSink(id))
      return true
    },
    close: () => {
      stream.close().catch(() => {})
    },
  })
  stream.onClosed(() => removeSink(id))
  sink.send(encode({ type: 'hello', body: { clientId: id, transport: 'sse' } }))
  return stream.send()
}

/**
 * Long poll. The first request (no `client`) registers a queue and answers immediately with `hello`; later requests
 * return queued events at once, or wait up to 25s for the next one.
 */
export async function poll(event: H3Event, user: ChannelUser, clientId?: string) {
  let entry = clientId ? polls.get(clientId) : undefined
  if (entry && entry.sink.userId !== user.id) entry = undefined

  if (!entry) {
    const id = ulid()
    const queue: string[] = []
    const sink = addSink({
      id,
      userId: user.id,
      channels: new Set(channelsFor(user)),
      transport: 'poll',
      send: (data) => {
        const current = polls.get(id)
        if (!current) return false
        if (current.waiter) {
          const resolve = current.waiter
          current.waiter = undefined
          resolve([data])
        } else {
          current.queue.push(data)
          if (current.queue.length > 500) current.queue.shift()
        }
        return true
      },
      close: () => {},
    })
    entry = { sink, queue, lastSeen: Date.now() }
    polls.set(id, entry)
    return [encode({ type: 'hello', body: { clientId: id, transport: 'poll' } })]
  }

  entry.lastSeen = Date.now()
  if (entry.queue.length) return entry.queue.splice(0)

  const current = entry
  current.waiter?.([])
  return await new Promise<string[]>((resolve) => {
    const timer = setTimeout(() => {
      current.waiter = undefined
      resolve([])
    }, POLL_HOLD_MS)
    current.waiter = (events) => {
      clearTimeout(timer)
      current.lastSeen = Date.now()
      resolve(events)
    }
  })
}
