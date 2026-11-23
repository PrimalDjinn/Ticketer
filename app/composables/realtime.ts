export function useRealtime() {
  const { $realtime, $realtimeStatus, $realtimeTransport } = useNuxtApp()
  return {
    realtime: $realtime as RealTime | undefined,
    status: ($realtimeStatus as Ref<RealtimeStatus> | undefined) ?? ref<RealtimeStatus>('idle'),
    transport: ($realtimeTransport as Ref<RealtimeTransport | null> | undefined) ?? ref(null),
  }
}

/** Listen to a realtime event for the lifetime of the calling component. Client only; a no-op during SSR. */
export function onRealtime<T extends RealtimeEventType>(type: T, handler: (body: Extract<RealtimeEvent, { type: T }>['body']) => void) {
  if (import.meta.server) return
  const { realtime } = useRealtime()
  const off = realtime?.on(type, ((event: RealtimeEvent) => handler(event.body as never)) as never)
  if (off) onScopeDispose(off)
}

/** Runs after the connection recovers from a gap, so callers can refetch what they may have missed. */
export function onRealtimeResync(handler: () => void) {
  if (import.meta.server) return
  const off = useRealtime().realtime?.onMeta('resync', handler)
  if (off) onScopeDispose(off)
}
