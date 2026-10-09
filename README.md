# anyrpc

A small, fully typed, transport-agnostic RPC library for TypeScript. Define your API as plain TypeScript interfaces and call remote functions as if they were local, with `Promise`-based return values, timeouts, error propagation and connection handling built in.

Messages follow the [JSON-RPC 2.0](https://www.jsonrpc.org/specification) format. The transport is pluggable through adapters. An adapter for **iframe ↔ host page** communication ships today, and more are planned.

```ts
// Call a function in another window and await its result. Fully typed.
const size = await channel.getSize()
```

## Why anyrpc?

Talking to another JavaScript context, such as an iframe, a worker or a socket, usually means working with `postMessage` directly:

- **No request/response pairing.** `postMessage` is fire-and-forget. To get an answer back you have to generate message IDs, keep a map of pending promises, match replies to requests and clean up afterwards.
- **No type safety.** Payloads are `any`. Message names are stringly typed, so typos and signature mismatches between both sides show up only at runtime.
- **No error semantics.** An exception thrown on the remote side is lost unless you serialize it and send it back by hand.
- **No timeouts.** If the other side never answers, your promise never settles.
- **Connection handshake boilerplate.** An iframe may not be loaded yet when the host wants to talk to it. You need a handshake, retries, origin checks and a way to know when the other side is ready.
- **Messages from everyone.** `window.onmessage` receives messages from every frame and browser extension on the page, so you end up writing a lot of filtering code.

anyrpc takes care of all of this. You describe both directions of communication as TypeScript interfaces and get back a typed proxy object. Calling a method sends a request, and the remote listener's return value (or thrown error) comes back as the resolved (or rejected) promise.

## Features

- 🔒 **End-to-end type safety.** Method names, parameters and return types are inferred from your interfaces.
- 🔁 **Bidirectional.** Both sides can call methods on each other over the same channel.
- ⏱️ **Timeouts.** Every request rejects with an `RpcError` if no response arrives in time.
- 📬 **Optional request queue.** Calls made before the connection is established can be queued and sent once connected.
- 🧯 **Error propagation.** Errors thrown in a remote handler are returned as JSON-RPC error responses and rejected locally as `RpcError`.
- 🔌 **Pluggable transports.** Adapters implement a small abstract class (`connect`, `sendMessage`, `destroy`).
- 📡 **Connection events.** Listen for `connected`, `closed` and `connection-change`.

## Adapters

- [x] **iframe** (`anyrpc/adapters/iframe`). Uses a dedicated `MessageChannel` after a handshake, with origin allow-listing and automatic reconnects (e.g. after the iframe reloads).
- [ ] Web Worker / `SharedWorker`
- [ ] `BroadcastChannel` (cross-tab)
- [ ] `window.open` / popup
- [ ] WebSocket
- [ ] WebRTC
- [ ] Node.js (e.g. `worker_threads`, child processes)

## Getting started

### Installation

> anyrpc has not been published to npm yet. Until it is, install it straight from GitHub:

```bash
npm install github:schwarzdavid/anyrpc
```

### 1. Define your API contract

Create a shared file that describes what each side can call on the other:

```ts
// messages.ts
export interface HostToIFrame {
    ping(): void
    getTitle(): string
}

export interface IFrameToHost {
    pong(): void
    size(width: number, height: number): void
}
```

### 2. Set up the host page

```ts
// host.ts
import { createRpcChannel } from 'anyrpc'
import { IFrameHostAdapter } from 'anyrpc/adapters/iframe'
import type { HostToIFrame, IFrameToHost } from './messages'

const iframe = document.querySelector('iframe')!

// createRpcChannel<MethodsICanCall, MethodsICanHandle>
const channel = createRpcChannel<HostToIFrame, IFrameToHost>(new IFrameHostAdapter(iframe, 'my-app'))

// Handle calls coming from the iframe
channel.addEventListener('size', (width, height) => {
    console.log(`iframe is ${width}x${height}`)
})

// Call methods inside the iframe
channel.$.addEventListener('connected', async () => {
    await channel.ping()
    const title = await channel.getTitle() // typed as string
})
```

### 3. Set up the iframe

```ts
// iframe.ts
import { createRpcChannel } from 'anyrpc'
import { IFrameClientAdapter } from 'anyrpc/adapters/iframe'
import type { HostToIFrame, IFrameToHost } from './messages'

const channel = createRpcChannel<IFrameToHost, HostToIFrame>(
    new IFrameClientAdapter('my-app', { origin: 'https://host.example.com' }),
)

channel.addEventListener('ping', () => console.log('ping received'))
channel.addEventListener('getTitle', () => document.title) // return value is sent back to the caller

await channel.size(window.innerWidth, window.innerHeight)
```

Both adapters must use the same **name** (`'my-app'` above). This lets several independent channels share one page.

### Channel API

| Member                                            | Description                                                                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channel.<method>(...args)`                       | Calls a remote method. Always returns a `Promise` of the method's return type.                                                                        |
| `channel.addEventListener(name, fn, { passive })` | Handles incoming calls. Only **one** non-passive listener per method may exist, and its return value is the response. Passive listeners only observe. |
| `channel.removeEventListener(name, fn)`           | Removes a listener.                                                                                                                                   |
| `channel.$.status`                                | Current `ConnectionStatus` (`'connected'` or `'closed'`).                                                                                             |
| `channel.$.addEventListener(event, fn)`           | Listens for connection events: `'connected'`, `'closed'`, `'connection-change'`.                                                                      |
| `channel.$.destroy()`                             | Closes the connection and removes all listeners from the transport.                                                                                   |

### Channel options

`createRpcChannel(adapter, options)` takes an optional second argument:

| Option         | Default | Description                                                                             |
| -------------- | ------- | --------------------------------------------------------------------------------------- |
| `timeout`      | `3000`  | Milliseconds to wait for a response before rejecting with a timeout `RpcError`.         |
| `queueEnabled` | `false` | Queue calls made while disconnected instead of rejecting them immediately.              |
| `queueTimeout` | `10000` | Milliseconds a queued call may wait for a connection before it rejects.                 |
| `queueAwait`   | `false` | Send queued calls one after another, waiting for each response, instead of all at once. |
| `autoConnect`  | `true`  | Call `adapter.connect()` automatically when the channel is created.                     |
| `logLevel`     | `INFO`  | Log verbosity (`DEBUG`, `INFO`, `WARN`, `ERROR`, `NONE`).                               |

### iframe adapter options

**`new IFrameHostAdapter(iframe, name?, options?)`**

| Option              | Default | Description                                                                    |
| ------------------- | ------- | ------------------------------------------------------------------------------ |
| `reconnect`         | `true`  | Keep listening for new handshakes, e.g. after the iframe navigates or reloads. |
| `postMessageOrigin` | `'*'`   | Target origin used for the handshake `postMessage`.                            |

**`new IFrameClientAdapter(name?, options?)`**

| Option              | Default | Description                                                                                                          |
| ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `origin`            | `true`  | Allowed parent origin(s): a string, `RegExp`, an array of both, a predicate function, or `true` to allow any origin. |
| `pollingInterval`   | `1000`  | Milliseconds between handshake attempts until the host answers.                                                      |
| `postMessageOrigin` | `'*'`   | Target origin used for the handshake `postMessage`.                                                                  |

> ⚠️ For production use, set `origin` (client) and `postMessageOrigin` (both sides) to explicit origins instead of the permissive defaults.

### Error handling

Errors thrown in a remote handler reject the caller's promise with an `RpcError`. The `RpcError` has a JSON-RPC `code`, a `message` and the original error details in `data`:

```ts
try {
    await channel.getTitle()
} catch (err) {
    // err.code: -32000 (server error), -32001 (timeout), -32002 (not connected), ...
}
```

## Development

```bash
npm install
npm run dev        # Vite dev server. Open /examples/iframe/ for the live iframe demo
npm test           # Unit and type tests (Vitest)
npm run coverage   # Tests with coverage report
npm run check      # TypeScript project build
npm run lint       # ESLint
npm run format     # Prettier check
npm run build      # Build ESM + CJS bundles and type declarations into dist/
```

## Todo

**Public API**

- [ ] Export `AbstractRpcAdapter` so users can write custom adapters
- [ ] Export `RpcError`, `RpcErrorCode`, `LogLevel` and `ConnectionStatus` from the package entry point (they are currently `const enum`s and internal)

**Protocol and behavior**

- [ ] Respond with `METHOD_NOT_FOUND` when no listener is registered for an incoming call (it currently resolves with `undefined`)
- [ ] Respond with proper JSON-RPC error responses for malformed incoming messages instead of throwing in the message handler
- [ ] Wire up the `errorIncludeStack` option so remote stack traces can be forwarded
- [ ] Support JSON-RPC notifications (fire-and-forget requests without `id`)
- [ ] Support request cancellation (e.g. via `AbortSignal`)
- [ ] Warn when `IFrameClientAdapter` allows any origin (`origin: true`)

**Project**

- [ ] Add API documentation and more examples
- [ ] Set up CI (lint, type check, test, build)
- [ ] Add a changelog
