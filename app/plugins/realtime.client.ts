/** One realtime connection per tab, following the session: connect when signed in (or a guest), drop on sign-out. */
export default defineNuxtPlugin(() => {
  const realtime = new RealTime()
  const status = ref<RealtimeStatus>(realtime.status)
  const transport = ref<RealtimeTransport | null>(null)
  realtime.onMeta('status', () => {
    status.value = realtime.status
    transport.value = realtime.transport
  })

  const { user } = useUserSession()
  watch(
    () => user.value?.id,
    (id, previous) => {
      if (!id) return realtime.disconnect()
      if (id !== previous) realtime.restart()
    },
    { immediate: true },
  )

  return { provide: { realtime, realtimeStatus: status, realtimeTransport: transport } }
})
