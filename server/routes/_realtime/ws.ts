export default defineWebSocketHandler({
  async upgrade(request) {
    // Reject before the socket opens when there is no session; the client falls back to anonymous mode.
    await requireUserSession(request)
  },
  async open(peer) {
    const { user } = await requireUserSession(peer)
    attachWebSocket(peer, user)
  },
  message(peer, message) {
    // Clients only ever send keepalives; everything else goes through the REST API.
    if (message.text() === 'ping') peer.send('pong')
  },
  close(peer) {
    removeSink(peer.id)
  },
  error(peer) {
    removeSink(peer.id)
  },
})
