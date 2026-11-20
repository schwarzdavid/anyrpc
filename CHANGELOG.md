# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). From 1.0.0 on, the project follows
[semantic versioning](https://semver.org/); the entry points marked as unstable in the
[README](README.md#stability) may change in a minor release.

## Unreleased

### Added

- Options for a single call: `channel.method.with({ timeout, signal })(...args)` sets a timeout of its own and cancels
  the call with an `AbortSignal`. Hubs support the same through `hub.method.with(options)`.
- Connection status `destroyed`. It is final: an adapter whose transport can never connect again destroys itself, the
  channel rejects everything that is still waiting, and a hub removes the peer.
- `peer.context` on hub peers: transport-specific information about a peer, typed through a third type parameter
  `Context` on `AbstractRpcHubAdapter`, `createRpcHub` and the hub types. Custom hub adapters pass it with
  `this.addPeer(adapter, context)`.
- `WebSocketHubAdapter` exposes the upgrade request as `peer.context.request`. New types `WebSocketPeerContext` and
  `WebSocketRequestLike`; `WebSocketHubAdapter` and `WebSocketServerLike` take the request type as type parameter.
- `logName` on adapters, so log prefixes survive minification.
- Types `RpcCall`, `RpcCallOptions`, `RpcConfigurable`, `RpcBroadcast`, `RpcAdapterBinding` and `RpcHubAdapterBinding`
  are exported from the package entry, `MessagePortInitiatorOptions` and `MessagePortResponderOptions` from
  `adapters/message-port`.

### Changed

- **Breaking:** the package is ESM only. The CommonJS bundles and the `import`/`require` export conditions are gone;
  CommonJS code can load the package with `require()` on Node.js 22.12 or newer.
- **Breaking:** channels and hubs connect to an adapter through a single `adapter.bind(...)`. The setters
  `messageHandler`, `connectionHandler` and `connectionLostHandler` and the method `initLogger` of `AbstractRpcAdapter`
  were removed. Custom adapters are only affected if they called them themselves.
- **Breaking:** `AbstractMessagePortHostAdapter` was renamed to `AbstractMessagePortResponderAdapter` and
  `AbstractMessagePortClientAdapter` to `AbstractMessagePortInitiatorAdapter`. Both take a single options object.
- **Breaking:** the package entry exports an explicit list instead of everything from `createRpcChannel` and
  `createRpcHub`. Internal helpers that were exported by accident are no longer available.
- **Breaking:** the `connection` listener of `WebSocketServerLike` takes the upgrade request as second argument. `ws`
  servers and servers with an untyped `on` (e.g. an `EventEmitter`) are not affected. A custom server type whose
  listener only declares the socket no longer matches; declare the second argument there. A server that does not
  pass a request at runtime still works, `peer.context.request` is `undefined` then.
- **Breaking:** the hub of a `WebSocketHubAdapter` is no longer an `RpcHub<Methods, Events>`, because its peers have a
  context. `createRpcHub<Methods, Events>(new WebSocketHubAdapter(server))` still compiles, but returns
  `RpcHub<Methods, Events, unknown>`. Write the type arguments on the adapter instead,
  `createRpcHub(new WebSocketHubAdapter<Methods, Events>(server))`, and add the context to annotations of your own:
  `RpcHub<Methods, Events, WebSocketPeerContext>`, `RpcPeer<Methods, Events, WebSocketPeerContext>`.
- `RpcPeer` and `RpcPeerConnection` have a required `context` property. Code that builds such objects by hand, e.g. in
  tests, has to add it (`context: undefined` for hubs without a context).
- The entry points `adapters/socket` and `adapters/message-port` are documented as unstable.
- The license is MPL-2.0 (before: ISC).
- `package.json` declares `engines.node >= 22`.

### Removed

- The dependency on `type-fest`. The package has no runtime dependencies.

## 0.0.2-alpha.1 - 2026-10-22

### Changed

- Consistent line endings in the published files.

## 0.0.2-alpha.0 - 2026-10-22

### Changed

- **Breaking:** the package was renamed to `@schwarzdavid/anyrpc`.

## 0.0.1-alpha.0 - 2026-10-22

First published version: `createRpcChannel` and `createRpcHub` with adapters for iframes, Web Workers, SharedWorkers,
WebSockets, Node.js worker threads and Node.js child processes.
