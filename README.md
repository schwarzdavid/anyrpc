# anyrpc

A small, fully typed, transport-agnostic RPC library for TypeScript. Define your API as plain TypeScript interfaces and call remote functions as if they were local, with `Promise`-based return values, timeouts, error propagation and connection handling built in.

Messages follow the [JSON-RPC 2.0](https://www.jsonrpc.org/specification) format (batch requests are not supported, see [JSON-RPC compliance](#json-rpc-compliance)). The transport is pluggable through adapters. An adapter for **iframe ↔ host page** communication ships today, and more are planned.

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

anyrpc takes care of all of this. You describe both directions of communication as TypeScript interfaces and get back a typed proxy object. Calling a method sends a request, and the remote handler's return value (or thrown error) comes back as the resolved (or rejected) promise.

## Features

- 🔒 **End-to-end type safety.** Method names, parameters and return types are inferred from your interfaces.
- 🔁 **Bidirectional.** Both sides can call methods on each other over the same channel.
- ⏱️ **Timeouts.** Every request rejects with an `RpcError` if no response arrives in time.
- 📬 **Optional request queue.** Calls made before the connection is established can be queued and sent once connected.
- 🧯 **Error propagation.** Errors thrown in a remote handler are returned as JSON-RPC error responses and rejected locally as `RpcError`.
- 🔌 **Pluggable transports.** Adapters implement a small abstract class (`connect`, `sendMessage`, `destroy`).
- 📡 **Connection events.** Listen for `rpc.connected`, `rpc.disconnected` and `rpc.status`.
- 📣 **Notifications.** Fire-and-forget calls for `void` methods via `channel.method.notify(...)`, observable by any number of listeners.

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

// Answer calls coming from the iframe
channel.$.handle('pong', () => console.log('pong received'))

// Observe calls and notifications coming from the iframe
channel.$.on('size', (width, height) => {
    console.log(`iframe is ${width}x${height}`)
})

// Call methods inside the iframe
channel.$.on('rpc.connected', async () => {
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

channel.$.handle('ping', () => console.log('ping received'))
channel.$.handle('getTitle', () => document.title) // return value is sent back to the caller

await channel.pong() // request: resolves once the host has handled it
channel.size.notify(window.innerWidth, window.innerHeight) // notification: fire-and-forget, no response
```

Both adapters must use the same **name** (`'my-app'` above). This lets several independent channels share one page.

### Channel API

| Member                                                                    | Description                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channel.<method>(...args)`                                               | Calls a remote method (JSON-RPC request). Always returns a `Promise` of the method's return type.                                                                   |
| `channel.<method>.notify(...args)`                                        | Sends a JSON-RPC notification: fire-and-forget, returns `void`. Only available for methods returning `void` or `Promise<void>`.                                     |
| `channel.$.handle(name, fn)`                                              | Answers incoming calls of `name`. Only **one** handler per method; its return value is the response. Returns a function that removes the handler.                   |
| `channel.$.on(name, fn)`                                                  | Observes incoming calls and notifications of `name`. Any number of listeners; return values are ignored. Returns a function that removes the listener.              |
| `channel.$.on('rpc.connected' \| 'rpc.disconnected' \| 'rpc.status', fn)` | Listens for connection events. `rpc.status` receives the new `ConnectionStatus`.                                                                                    |
| `channel.$.on('rpc.error', fn)`                                           | Receives an `RpcError` for every invalid incoming message and for error responses the other side could not assign to a request (`id: null`). Useful for monitoring. |
| `channel.$.status`                                                        | Current `ConnectionStatus` (`'connected'` or `'disconnected'`).                                                                                                     |
| `channel.$.destroy()`                                                     | Closes the connection and removes all listeners from the transport.                                                                                                 |

The only property names a remote method cannot have are `$`, `then` and names starting with `rpc.` (reserved by JSON-RPC 2.0, used here for channel events).

### Requests, notifications and listeners

- **Requests** (`channel.ping()`) wait for a response. If no handler is registered on the other side, the promise rejects with `-32601` (method not found).
- **Notifications** (`channel.size.notify(...)`) never get a response. On the receiving side, the handler (if any) and all `on`-listeners run; errors are only logged. Use them for events where the caller does not need a result or an acknowledgement.
- **Listeners** registered with `$.on` run for every incoming call, before the handler. Each listener is isolated: if one throws, the error is logged and neither other listeners nor the response are affected.
- For **requests without a handler**, listeners do not run by default, because the call failed for the caller. Set `unhandledRequests: 'observe'` to run them anyway (the caller still receives `-32601`).
- When the queue is enabled, notifications made while disconnected are queued as well. If no connection is established within `queueTimeout`, they are dropped with a warning.

### Channel options

`createRpcChannel(adapter, options)` takes an optional second argument:

| Option              | Default    | Description                                                                                                                                             |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeout`           | `3000`     | Milliseconds to wait for a response before rejecting with a timeout `RpcError`.                                                                         |
| `queueEnabled`      | `false`    | Queue calls made while disconnected instead of rejecting them immediately.                                                                              |
| `queueTimeout`      | `10000`    | Milliseconds a queued call may wait for a connection before it rejects.                                                                                 |
| `queueAwait`        | `false`    | Send queued calls one after another, waiting for each response, instead of all at once.                                                                 |
| `autoConnect`       | `true`     | Call `adapter.connect()` automatically when the channel is created.                                                                                     |
| `errorIncludeStack` | `false`    | Include the stack trace of errors thrown in your handlers in the error response sent to the caller.                                                     |
| `unhandledRequests` | `'reject'` | `'reject'`: requests without a handler are answered with `-32601` and listeners do not run. `'observe'`: listeners run, the response is still `-32601`. |
| `logLevel`          | `INFO`     | Log verbosity (`DEBUG`, `INFO`, `WARN`, `ERROR`, `NONE`).                                                                                               |

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
    // err.code: -32000 (server error), -32601 (method not found), -31001 (timeout), -31002 (not connected), ...
}
```

| Code     | Origin | Meaning                                                                                                                                                 |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-32700` | remote | The other side could not parse the message as JSON. `data.reason` explains why.                                                                         |
| `-32600` | remote | The message is not a valid JSON-RPC request (e.g. `method` is not a string). `data.reason` explains why.                                                |
| `-32601` | remote | No handler is registered for the called method, or the method name starts with `rpc.`.                                                                  |
| `-32602` | remote | The call used named params (an object). Handlers only support positional params.                                                                        |
| `-32603` | remote | The handler succeeded, but its result could not be sent (e.g. a function or DOM node that `postMessage` cannot clone). The original error is in `data`. |
| `-32000` | remote | The remote handler threw. The original error's `name` and `message` are in `data`.                                                                      |
| `-31001` | local  | No response arrived within `timeout`, or a queued call waited longer than `queueTimeout`.                                                               |
| `-31002` | local  | The method was called while disconnected and the queue is disabled.                                                                                     |

The local codes lie outside the range JSON-RPC reserves for protocol and server errors (`-32768` to `-32000`) and are never sent over the wire. If a handler throws an `RpcError` with an application-defined code (any code outside that range, except the local codes), the caller receives it unchanged. Every other error is wrapped in a `-32000` server error.

### JSON-RPC compliance

- **Batch requests are not supported.** anyrpc never sends batches, and an incoming array of requests is answered with `-32600` (invalid request).
- **Invalid incoming messages are answered with an error response.** Unparsable JSON gets `-32700`, a structurally invalid request or notification gets `-32600`, both with a `data.reason`. The response carries the message's `id` if it could be read, otherwise `id: null`. Invalid messages that look like responses (they contain `result` or `error`) are never answered, so two peers cannot end up in an error loop. Every invalid message is logged as a warning and emitted as `rpc.error`.
- Error responses with `id: null` cannot be matched to a request. They are logged and emitted as `rpc.error`; the affected request rejects with a timeout.
- Messages the transport receives from unrelated sources (e.g. other frames or browser extensions posting to `window`) are filtered by the adapter before they reach the channel and are never answered.
- Handlers that return `undefined` (e.g. `void` methods) respond with `result: null`, because `undefined` is not a JSON value. The caller receives `null`.
- Method names starting with `rpc.` are reserved by the specification. Calling them throws, and incoming calls to them are answered with `-32601`.
- A channel is never a thenable, so it can safely be returned from `async` functions. As a consequence, interface members named `then` cannot be called.

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

- [ ] Support request cancellation (e.g. via `AbortSignal`)
- [ ] Warn when `IFrameClientAdapter` allows any origin (`origin: true`)

**Project**

- [ ] Add API documentation and more examples
- [ ] Set up CI (lint, type check, test, build)
- [ ] Add a changelog
