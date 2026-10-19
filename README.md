# anyrpc

A small, fully typed, transport-agnostic RPC library for TypeScript. Define your API as plain TypeScript interfaces and call remote functions as if they were local, with `Promise`-based return values, timeouts, error propagation and connection handling built in.

Messages follow the [JSON-RPC 2.0](https://www.jsonrpc.org/specification) format (batch requests are not supported, see [JSON-RPC compliance](#json-rpc-compliance)). The transport is pluggable through adapters. Adapters for **iframe ↔ host page** and **page ↔ Web Worker** communication ship today, and more are planned.

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
- 🔌 **Pluggable transports.** Adapters implement a small abstract class (`connect`, `sendMessage`, `destroy`), see [Custom adapters](#custom-adapters).
- 📡 **Connection events.** Listen for `rpc.connected`, `rpc.disconnected` and `rpc.status`. Pending calls reject immediately when the connection is lost.
- 📣 **Notifications.** Fire-and-forget calls for `void` methods via `channel.method.notify(...)`, observable by any number of listeners.

## Adapters

- [x] **iframe** (`anyrpc/adapters/iframe`). Uses a dedicated `MessageChannel` after a handshake, with origin allow-listing on both sides, optional heartbeat and automatic reconnects (e.g. after the iframe reloads).
- [x] **Web Worker** (`anyrpc/adapters/web-worker`). Dedicated workers only, with a `MessageChannel` per channel, optional heartbeat and error logging.
- [ ] `SharedWorker` / `ServiceWorker`
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

| Member                                                                    | Description                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channel.<method>(...args)`                                               | Calls a remote method (JSON-RPC request). Always returns a `Promise` of the method's return type.                                                                                                                                           |
| `channel.<method>.notify(...args)`                                        | Sends a JSON-RPC notification: fire-and-forget, returns `void`. Only available for methods returning `void` or `Promise<void>`.                                                                                                             |
| `channel.$.handle(name, fn)`                                              | Answers incoming calls of `name`. Only **one** handler per method; its return value is the response. Returns a function that removes the handler.                                                                                           |
| `channel.$.on(name, fn)`                                                  | Observes incoming calls and notifications of `name`. Any number of listeners; return values are ignored. Returns a function that removes the listener.                                                                                      |
| `channel.$.on('rpc.connected' \| 'rpc.disconnected' \| 'rpc.status', fn)` | Listens for connection events. `rpc.status` receives the new `ConnectionStatus`.                                                                                                                                                            |
| `channel.$.on('rpc.error', fn)`                                           | Receives an `RpcError` for every invalid incoming message and for error responses the other side could not assign to a request (`id: null`). Useful for monitoring.                                                                         |
| `channel.$.status`                                                        | Current `ConnectionStatus` (`'connected'` or `'disconnected'`).                                                                                                                                                                             |
| `channel.$.destroy()`                                                     | Closes the connection, notifies the other side if the transport supports it, rejects pending and queued calls with `-31003`, drops queued notifications and removes all listeners from the transport. Calls made afterwards throw `-31002`. |

A remote method cannot be named `$`, `then`, `toJSON`, anything starting with `rpc.` (reserved by JSON-RPC 2.0, used here for channel events) or a member of `Object.prototype` such as `toString`, `valueOf` or `hasOwnProperty`. The runtime and many libraries probe objects for exactly these names (string coercion, `JSON.stringify`, `await`, duck typing), so a proxy method that sends a request would get called by accident. `createRpcChannel` therefore rejects interfaces on either side that declare one of them with a type error naming the offending methods (`ForbiddenMethodNames<"toString">`). At runtime the proxy returns the built-in for these names, or `undefined` for `then` and `toJSON`, instead of sending a request.

### Requests, notifications and listeners

- **Requests** (`channel.ping()`) wait for a response. If no handler is registered on the other side, the promise rejects with `-32601` (method not found).
- **Notifications** (`channel.size.notify(...)`) never get a response. On the receiving side, the handler (if any) and all `on`-listeners run; errors are only logged. Use them for events where the caller does not need a result or an acknowledgement.
- **Listeners** registered with `$.on` run for every incoming call, before the handler. Each listener is isolated: if one throws, the error is logged and neither other listeners nor the response are affected.
- For **requests without a handler**, listeners do not run by default, because the call failed for the caller. Set `unhandledRequests: 'observe'` to run them anyway (the caller still receives `-32601`).
- When the queue is enabled, notifications made while disconnected are queued as well. If no connection is established within `queueTimeout`, they are dropped with a warning.
- Queued calls survive a lost connection and are sent once the next connection is established. `channel.$.destroy()` rejects them with `-31003`. If the connection drops while the queue is being sent, the remaining calls stay queued.
- `rpc.status` is emitted as soon as the adapter reports a change. `rpc.connected` follows once the queued calls have been sent (with `queueAwait`, once they have been answered), so calls made in a `rpc.connected` listener go out after the queued ones. `rpc.disconnected` is emitted right after `rpc.status`.

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

| Option      | Default | Description                                                                                                                                                |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`    | `true`  | Allowed iframe origin(s): a string, `RegExp`, an array of both, a predicate function, or `true` or `'*'` to allow any origin.                              |
| `reconnect` | `true`  | Keep listening for new handshakes, e.g. after the iframe navigates or reloads.                                                                             |
| `heartbeat` | `false` | `true` or `{ interval?, timeout? }` to ping the iframe. Defaults: ping every `5000` ms, report `disconnected` if a ping is not answered within `10000` ms. |

**`new IFrameClientAdapter(name?, options?)`**

| Option            | Default | Description                                                                                                                   |
| ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `origin`          | `true`  | Allowed parent origin(s): a string, `RegExp`, an array of both, a predicate function, or `true` or `'*'` to allow any origin. |
| `pollingInterval` | `1000`  | Milliseconds between handshake attempts until the host answers.                                                               |

> ⚠️ For production use, set `origin` on both sides to explicit origins instead of the permissive default. Both adapters log a warning while they accept any origin, and they log every handshake message they ignore because of the origin. String origins are compared as URL origins, so casing, a trailing slash or a default port do not matter.

**Connection lifecycle**

- The host reports `connected` only once the iframe has accepted the handshake (it answers a ping on the control port). An iframe that rejects the host's origin keeps repeating its handshake request, which the host logs, and the host stays `disconnected`.
- When one side calls `channel.$.destroy()`, the other side is told right away: it switches to `disconnected` and rejects its pending calls with `-31003`. The iframe side then starts a new handshake, so a new host channel connects automatically.
- When the iframe reloads, the host emits `rpc.disconnected` followed by `rpc.connected`, and calls that were still waiting for the old document are rejected with `-31003`.
- If two host adapters with the same name answer the handshake, the iframe keeps the first connection and declines the second with a goodbye. That host stays `disconnected`, and the iframe logs a warning.
- An iframe that navigates to a page without anyrpc cannot say goodbye. Enable the `heartbeat` to detect this: the host reports the channel as `disconnected` once the iframe stops answering pings, see the notes on the [Web Worker heartbeat](#web-worker-adapter) for how in-flight calls behave.

### Web Worker adapter

The host side creates the worker and passes it to `WebWorkerHostAdapter`. Inside the worker, `WebWorkerClientAdapter` connects to it. Both come from the same entry point, and bundlers drop the side you do not import. Creating `WebWorkerClientAdapter` outside of a worker throws an error that points you to `WebWorkerHostAdapter`.

```ts
// main.ts
import { createRpcChannel } from 'anyrpc'
import { WebWorkerHostAdapter } from 'anyrpc/adapters/web-worker'
import type { MainToWorker, WorkerToMain } from './messages'

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
const channel = createRpcChannel<MainToWorker, WorkerToMain>(new WebWorkerHostAdapter(worker, 'my-app'))

const result = await channel.compute(42)
```

```ts
// worker.ts
import { createRpcChannel } from 'anyrpc'
import { WebWorkerClientAdapter } from 'anyrpc/adapters/web-worker'
import type { MainToWorker, WorkerToMain } from './messages'

const channel = createRpcChannel<WorkerToMain, MainToWorker>(new WebWorkerClientAdapter('my-app'))

channel.$.handle('compute', (input) => expensiveCalculation(input))
```

As with iframes, both sides must use the same **name**, so one worker can serve several independent channels. Messages the worker exchanges with `postMessage` outside of anyrpc are ignored.

**Connection lifecycle**

- The host reports `connected` only once the worker has accepted the handshake (it answers a ping on the control port).
- When one side calls `channel.$.destroy()`, the other side is told right away: it switches to `disconnected` and rejects its pending calls with `-31003`. The worker side then starts a new handshake, so a new host channel for the same worker connects automatically.
- If two host adapters with the same name answer the handshake, the worker keeps the first connection and declines the second with a goodbye. That host stays `disconnected`, and the worker logs a warning.
- `worker.terminate()` and `self.close()` cannot be observed directly. Enable the `heartbeat` to detect them: the host pings the worker and reports it as `disconnected` if it does not answer within `timeout`. Calls that are still in flight are not rejected by the heartbeat; they fail with `-31001` once their own `timeout` expires.
- A worker that is busy with a long synchronous task cannot answer pings either. It is reported as `disconnected` as well, and as `connected` again as soon as it answers. In the meantime, in-flight calls keep waiting for their response, and new calls are queued or throw `-31002` as usual.
- Uncaught errors in the worker and workers that fail to load (e.g. a wrong script URL) are logged by the host adapter.

**`new WebWorkerHostAdapter(worker, name?, options?)`**

| Option               | Default | Description                                                                                                                                                |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heartbeat`          | `false` | `true` or `{ interval?, timeout? }` to ping the worker. Defaults: ping every `5000` ms, report `disconnected` if a ping is not answered within `10000` ms. |
| `terminateOnDestroy` | `false` | Call `worker.terminate()` when the channel is destroyed.                                                                                                   |

**`new WebWorkerClientAdapter(name?, options?)`**

| Option            | Default | Description                                                     |
| ----------------- | ------- | --------------------------------------------------------------- |
| `pollingInterval` | `1000`  | Milliseconds between handshake attempts until the host answers. |

### Error handling

Errors thrown in a remote handler reject the caller's promise with an `RpcError`. The `RpcError` has a JSON-RPC `code`, a `message` and the original error details in `data`:

```ts
import { RpcError, RpcErrorCode } from 'anyrpc'

try {
    await channel.getTitle()
} catch (err) {
    // err.code: -32000 (server error), -32601 (method not found), -31001 (timeout), -31002 (not connected), -31003 (connection lost), ...
    if (err instanceof RpcError && err.code === RpcErrorCode.TIMEOUT_ERROR) {
        retryLater()
    }
}
```

| Code     | Origin | Meaning                                                                                                                                                                       |
| -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-32700` | remote | The other side could not parse the message as JSON. `data.reason` explains why.                                                                                               |
| `-32600` | remote | The message is not a valid JSON-RPC request (e.g. `method` is not a string). `data.reason` explains why.                                                                      |
| `-32601` | remote | No handler is registered for the called method, or the method name starts with `rpc.`.                                                                                        |
| `-32602` | remote | The call used named params (an object). Handlers only support positional params.                                                                                              |
| `-32603` | remote | The handler succeeded, but its result could not be sent (e.g. a function or DOM node that `postMessage` cannot clone). The original error is in `data`.                       |
| `-32000` | remote | The remote handler threw. The original error's `name` and `message` are in `data`.                                                                                            |
| `-31001` | local  | No response arrived within `timeout`, or a queued call waited longer than `queueTimeout`.                                                                                     |
| `-31002` | local  | The method was called while disconnected and the queue is disabled, or after the channel was destroyed.                                                                       |
| `-31003` | local  | The connection was closed before the response arrived: one side called `destroy()` or the other side established a new connection. A heartbeat timeout does not trigger this. |

The local codes lie outside the range JSON-RPC reserves for protocol and server errors (`-32768` to `-32000`) and are never sent over the wire. If a handler throws an `RpcError` with an application-defined code (any code outside that range, except the local codes), the caller receives it unchanged. Every other error is wrapped in a `-32000` server error. Thrown `Error` instances are serialized to their `name` and `message` (plus `stack` with `errorIncludeStack`); other properties are dropped. Thrown values that are no errors, such as strings, are sent as `data` unchanged.

If the transport cannot send a request at all, for example because an argument is a function that `postMessage` cannot clone, the call rejects with the transport's own error (a `DataCloneError` in browsers) instead of an `RpcError`, and `notify()` throws it synchronously. A queued notification that cannot be sent is logged and dropped.

### Custom adapters

Everything a transport needs is exported from `anyrpc`. Extend `AbstractRpcAdapter`, implement `connect()` and `sendMessage()`, hand incoming messages to `this.onMessage()`, report the state through `this.connectionStatus`, and call `this.closeConnection()` once the transport is definitively gone. The latter rejects in-flight calls with `-31003`; a plain status change does not, so a transport that is merely unresponsive can still deliver late responses. `connect()` may return a promise; if it rejects, the channel logs the error and stays `disconnected`. An adapter instance serves exactly one channel, so `createRpcChannel` throws if the adapter is already in use, until that channel is destroyed.

```ts
import { AbstractRpcAdapter, ConnectionStatus, type MethodMap, type RpcMessage } from 'anyrpc'

class WebSocketAdapter<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> extends AbstractRpcAdapter<
    Methods,
    Events
> {
    constructor(private readonly socket: WebSocket) {
        super()
    }

    connect(): void {
        this.socket.addEventListener('open', () => {
            this.connectionStatus = ConnectionStatus.CONNECTED
        })
        this.socket.addEventListener('message', (event) => void this.onMessage(event.data as string))
        this.socket.addEventListener('close', () => this.closeConnection())
    }

    sendMessage(message: RpcMessage<Methods, Events>): void {
        this.socket.send(JSON.stringify(message))
    }
}
```

Transports that hand over `MessagePort`s after a handshake, like the iframe and Web Worker adapters, build on `anyrpc/adapters/message-port` instead. Extend `AbstractMessagePortHostAdapter` (the side that creates the `MessageChannel`) or `AbstractMessagePortClientAdapter` (the side that polls for it) and implement only how handshake messages are listened for and posted; ports, heartbeat, goodbye notifications and reconnects come with the base classes. The host side reports `connected` only after the client answered the first ping on the control port.

`ConnectionStatus`, `LogLevel` and `RpcErrorCode` are plain `as const` objects with a same-named union type, so `status === 'connected'` and `code === -31001` type-check as well.

### JSON-RPC compliance

- **Batch requests are not supported.** anyrpc never sends batches, and an incoming array of requests is answered with `-32600` (invalid request).
- **Invalid incoming messages are answered with an error response.** Unparsable JSON gets `-32700`, a structurally invalid request or notification gets `-32600`, both with a `data.reason`. The response carries the message's `id` if it could be read, otherwise `id: null`. Invalid messages that look like responses (they contain `result` or `error`) are never answered, so two peers cannot end up in an error loop. Every invalid message is logged as a warning and emitted as `rpc.error`.
- Error responses with `id: null` cannot be matched to a request. They are logged and emitted as `rpc.error`; the affected request rejects with a timeout.
- Messages the transport receives from unrelated sources (e.g. other frames or browser extensions posting to `window`) are filtered by the adapter before they reach the channel and are never answered.
- Handlers that return `undefined` (e.g. `void` methods) respond with `result: null`, because `undefined` is not a JSON value. The caller receives `null`, and the channel types reflect this: a method declared as `find(): string | undefined` resolves to `string | null`, and one declared as `probe(): undefined` resolves to `null`.
- `params` must be omitted or be an array or an object. A message that carries `params: undefined` as an own property (possible through structured cloning) is rejected with `-32600`.
- Method names starting with `rpc.` are reserved by the specification. Calling them throws, and incoming calls to them are answered with `-32601`.
- A channel is never a thenable and has no `toJSON`, so it can safely be returned from `async` functions and passed to `JSON.stringify` (which yields the connection status). Interface members named `then` or `toJSON` are rejected by the types.

## Development

```bash
npm install
npx playwright install chromium   # once, for the browser tests
npm run dev        # Vite dev server. Open /examples/iframe/ or /examples/web-worker/ for the live demos
npm test           # Unit, type and browser tests (Vitest). Also checks the built package in dist/ once npm run build was run
npm run coverage   # Tests with coverage report
npm run check      # TypeScript project build
npm run lint       # ESLint
npm run format     # Prettier check
npm run build      # Build ESM + CJS bundles and type declarations into dist/
```

## Todo

**Public API**

- [x] Export `AbstractRpcAdapter` so users can write custom adapters
- [x] Export `RpcError`, `RpcErrorCode`, `LogLevel` and `ConnectionStatus` from the package entry point

**Protocol and behavior**

- [ ] Support request cancellation (e.g. via `AbortSignal`)
- [x] Warn when `IFrameClientAdapter` allows any origin (`origin: true`)

**Project**

- [ ] Add API documentation and more examples
- [ ] Set up CI (lint, type check, test, build)
- [ ] Add a changelog
