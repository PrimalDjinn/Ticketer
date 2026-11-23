/**
 * Cloudflare only: answer client keepalive pings without waking the Durable Object, so idle sockets let it hibernate.
 */
declare const WebSocketRequestResponsePair: new (request: string, response: string) => unknown

interface DurableInit {
  state: { setWebSocketAutoResponse(pair: unknown): void }
}

export default defineNitroPlugin((nitroApp) => {
  const hooks = nitroApp.hooks as unknown as {
    hook(name: 'cloudflare:durable:init', fn: (durable: unknown, init: DurableInit) => void): void
  }
  hooks.hook('cloudflare:durable:init', (_durable, { state }) => {
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  })
})
