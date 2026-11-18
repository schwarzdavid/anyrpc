# Todo: connection context for hub peers

Status: open. Next step: write an implementation plan from this document, then implement it.

## Problem

A hub knows nothing about a peer except a random id and its channel:

```ts
// src/types/RpcHub.ts
export interface RpcPeer<Methods, Events> {
    readonly id: string
    readonly channel: RpcChannel<Methods, Events>
}
```

For server-side transports this is not enough. A WebSocket server cannot tell which user, session or tenant a peer
belongs to, because `WebSocketHubAdapter` drops the upgrade request that `ws` passes as the second argument of the
`connection` event:

```ts
// src/lib/adapter/websocket/WebSocketHubAdapter.ts
export interface WebSocketServerLike {
    on(event: 'connection', listener: (socket: WebSocketLike) => void): unknown
    off(event: 'connection', listener: (socket: WebSocketLike) => void): unknown
}

private readonly onConnection = (socket: WebSocketLike) => this.acceptSocket(socket)
```

The request carries the cookies, the `Authorization` header, the URL with its query string and the remote address.
Today a consumer has to work around this with an application-level `login` call over RPC and a `Map<peer.id, user>`
of their own. Rejecting a connection is only possible before the upgrade (`verifyClient` or `noServer` plus
`handleUpgrade`), and the identity determined there cannot be handed over to the peer.

## Goal

Handlers, listeners and the `rpc.peer.connected`/`rpc.peer.disconnected` events can read transport-specific
information about the peer, fully typed, without a lookup table on the consumer side:

```ts
const hub = createRpcHub<ServerToClient, ClientToServer>(new WebSocketHubAdapter(server))

hub.$.handle('getProfile', ({ peer }) => loadProfile(readSession(peer.context.request)))
```

## Where the pieces are

| Concern                                    | Location                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Peer and call context types                | `src/types/RpcHub.ts` (`RpcPeer`, `RpcCallContext`, `RpcHubMeta`, `RpcHub`)                                                                            |
| Hub adapter contract                       | `src/lib/adapter/AbstractRpcHubAdapter.ts` (`addPeer(adapter)`, `RpcPeerConnection`)                                                                   |
| Hub: creates the peer object               | `src/createRpcHub.ts`, function `addPeer` (`{ peer: { id, channel }, ... }`)                                                                           |
| WebSocket hub adapter                      | `src/lib/adapter/websocket/WebSocketHubAdapter.ts`                                                                                                     |
| SharedWorker hub adapter                   | `src/lib/adapter/web-worker/SharedWorkerHubAdapter.ts`                                                                                                 |
| Public exports                             | `src/index.ts` (explicit list), `src/lib/adapter/websocket/index.ts`                                                                                   |
| Runtime tests                              | `test/unit/createRpcHub.test.ts`, `test/unit/lib/adapter/AbstractRpcHubAdapter.test.ts`, `test/unit/lib/adapter/websocket/WebSocketHubAdapter.test.ts` |
| Type tests                                 | `test/unit/createRpcHub.test-d.ts`, `test/unit/lib/adapter/websocket/index.test-d.ts`                                                                  |
| End-to-end test against a real `ws` server | `test/node/websocket/webSocketAdapter.test.ts`                                                                                                         |
| Docs                                       | README sections "Hubs (one-to-many)", "WebSocket adapter", "Custom adapters"                                                                           |

How peers come and go today: the hub adapter calls `this.addPeer(adapter)`, the hub wraps the adapter in a channel and
announces the peer once that channel is connected. A peer is removed when its adapter reaches the status `destroyed`
(the hub listens to `rpc.status` of the peer channel) or when the hub adapter calls `this.removePeer(id)`.

## Proposed design

1. Add a third type parameter `Context` to the hub side, defaulting to `undefined` so existing code keeps compiling:
   `AbstractRpcHubAdapter<Methods, Events, Context = undefined>`, `RpcPeerConnection`, `RpcPeer`, `RpcCallContext`,
   `RpcHubMeta`, `RpcHub`, `RpcHubEvents`, `RpcHubHandler`, `RpcHubListener`, `RpcPeerPromise`.
2. `addPeer(adapter, context)` passes the context on; `RpcPeer` gets `readonly context: Context`. For adapters with
   `Context = undefined` the second argument must stay optional (overload or conditional rest parameter), so
   `SharedWorkerHubAdapter` and custom hub adapters do not change.
3. `createRpcHub` infers `Context` from the hub adapter, so consumers never write it out:
   `createRpcHub<Methods, Events>(new WebSocketHubAdapter(server))` must still work with two explicit type arguments.
   Check whether partial inference allows this; if not, infer everything from the adapter instance and let the adapter
   carry `Methods`/`Events` as it does today.
4. `WebSocketHubAdapter` gets the context `{ request: Request }`, where `Request` is a type parameter of the adapter
   that is inferred from the server (`WebSocketServerLike<Request>`), because the entry point must not depend on `ws`
   or `node:http`. With a `ws` server it resolves to `IncomingMessage`.

## Decisions the plan has to make

- **Name of the property**: `peer.context` (proposed) versus `peer.connection`. `context` collides in wording with
  `RpcCallContext` (`{ peer }`), so `peer.connection` or `peer.info` may read better: `({ peer }) => peer.connection.request`.
- **Authentication hook**: is exposing the request enough (authentication stays in `verifyClient`/`handleUpgrade`), or
  does the hub adapter need an option that derives the context and can reject a connection, e.g.
  `new WebSocketHubAdapter(server, { context: (request) => authenticate(request) })`? The project rule is to add no
  options for theoretical cases, so start without the option unless the examples show it is needed.
- **SharedWorker**: there is nothing comparable to a request. Keep `Context = undefined`.
- **Mutable per-peer state** (e.g. a user set after a `login` call): out of scope, a `WeakMap<RpcPeer, State>` on the
  consumer side covers it. Mention it in the README.

## Constraints

- Breaking change for everything reachable through `package.json` `exports` must be called out. A defaulted type
  parameter and an optional argument keep this change non-breaking; verify with the existing type tests.
- 100% coverage must hold (`npm run coverage`), type tests are required for the new inference
  (`createRpcHub.test-d.ts`: `peer.context` is typed in handlers, listeners, `hub.$.peers`, `hub.$.peer(id)`, the
  peer events and `RpcPeerPromise.peer`).
- No comments in code, `as const` objects instead of `enum`, public types of the websocket entry stay lib-neutral.
- Update the README (hub table, WebSocket section with an authentication example, custom hub adapters) and the
  WebSocket example in `examples/websocket/`.

## Done when

- A `ws` server test in `test/node/websocket/` reads a header or query parameter of the upgrade request inside a hub
  handler through the peer.
- `npm run coverage`, `npm run check`, `npm run lint` and `npm run format` pass.
