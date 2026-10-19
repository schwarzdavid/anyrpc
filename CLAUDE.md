# CLAUDE.md

## Project

anyrpc is a small, fully typed, transport-agnostic RPC library for TypeScript. Consumers describe both directions of
communication as interfaces and get back a typed proxy (`createRpcChannel`). Messages follow JSON-RPC 2.0, and the
transport is pluggable through adapters that extend `AbstractRpcAdapter` (`src/lib/adapter/AbstractRpcAdapter.ts`,
exported from the package entry together with `ConnectionStatus`, `LogLevel`, `RpcError` and `RpcErrorCode`).
Adapters for iframes (`src/lib/adapter/iframe/`) and web workers (`src/lib/adapter/web-worker/`) exist, as well as for Node.js worker threads
(`src/lib/adapter/node-worker/`); more
transports are planned (see README). Transports that exchange `MessagePort`s after a handshake extend
`AbstractMessagePortHostAdapter` (the side that answers the handshake and creates the `MessageChannel`s) or
`AbstractMessagePortClientAdapter` (the side that starts the handshake and polls until it is answered). Which side
starts depends on the transport: an iframe asks its parent, a page asks its worker. `Host`/`Client` in the public
adapter names mean the embedding/embedded side, not the handshake role (`WebWorkerHostAdapter` extends the client
base). Both build on `AbstractMessagePortAdapter`, which owns the ports, the heartbeat and the
control protocol (ping/pong/goodbye). They live in `src/lib/adapter/message-port/` and ship as
`anyrpc/adapters/message-port`. One-to-many transports (e.g. a `SharedWorker` serving many tabs) use `createRpcHub`
with an adapter that extends `AbstractRpcHubAdapter` (`src/lib/adapter/AbstractRpcHubAdapter.ts`): the hub adapter
reports peers via `addPeer(adapter)`/`removePeer(id)`, and the hub wraps every peer adapter in a regular channel, so
the channel core stays 1:1. Channel and hub share the same proxy shape (`createMethodProxy`): methods on the object,
everything else under `$`. Enumerations are `as const` objects with a same-named union type, never `enum`, so
they stay usable for consumers with `isolatedModules`.

## Guiding principles

- **Developer experience of consumer projects comes first.** Every public API decision is judged by how easy, obvious
  and type-safe it is for the people who install this library. Prefer sensible defaults, minimal required
  configuration, strong type inference and errors that tell the consumer what went wrong and how to fix it.
- **Open for extension.** New transports, options and behaviors must be addable without modifying the core. Keep the
  core transport-agnostic, keep adapter contracts small, and expose extension points through abstractions rather than
  special cases in `createRpcChannel`.
- **Keep it simple to use.** A consumer should get a working channel in a few lines. If a feature makes the common case
  harder, rethink it.
- **No options for theoretical edge cases.** Every option is something a consumer has to read, understand and decide
  on. Only add one when a real use case needs it, not because an API underneath offers a knob or a corner case is
  conceivable. Two options that configure nearly the same thing are a design smell. When in doubt, pick a sensible
  fixed behavior and leave the option out.
- Treat everything reachable through `package.json` `exports` as public API. Changing it is a breaking change; call it
  out explicitly.

## Code style

- **Do not write comments.** Code that needs a comment to be understood is not good enough. Express intent through
  naming, small functions and types instead. This applies to new code and to code you touch.
- Match the surrounding code: 4-space indent, no semicolons, single quotes, max line length 120 (Prettier + EditorConfig).
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on) and the `@/` alias for `src/`.
- Assign conditionally with an `if` statement, never with `x = condition && value`. `&&` is for boolean logic only.
- The TypeScript config is strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, ...).
  Do not weaken it, and avoid `any` and non-null assertions in library code.
- **Never remove defensive code without asking**, even when it looks unreachable or blocks the coverage goal. Guards
  against unexpected or forged messages are often deliberate. Explain the situation and propose a restructuring that
  keeps the intent explicit, e.g. making the error the default fallthrough instead of an unreachable branch.

## Testing

- **The library must keep 100% test coverage** (statements, branches, functions, lines). Every change to `src/` comes
  with tests that keep it there; verify with `npm run coverage`. Never reach coverage with ignore comments or by
  excluding files. If code is hard to cover, simplify the code.
- Tests live in `test/unit/`, mirroring the `src/` structure. Runtime tests use `*.test.ts`, type tests use `*.test-d.ts`.
- End-to-end tests against real browser APIs (e.g. real workers) live in `test/browser/` and run in Chromium via Vitest
  browser mode. Code running inside a worker is not counted by coverage, so cover it with unit tests in `test/unit/`.
- Use `describe(ClassOrFunction, ...)` and Vitest mocks (`vi.fn`) as the existing tests do.
- Public types are part of the DX. When changing inference or signatures, add or update type tests.

## Commands

```bash
npm test           # unit + type tests (vitest run --typecheck)
npm run coverage   # tests with coverage report, must stay at 100%
npm run check      # tsc project build
npm run lint       # ESLint
npm run format     # Prettier check (format:fix to write)
npm run build      # ESM + CJS bundles and d.ts into dist/
npm run dev        # Vite dev server, live demo at /examples/iframe/
```

Before reporting work as done, run `npm run coverage`, `npm run check`, `npm run lint` and `npm run format`.

## Adding an adapter

1. Create `src/lib/adapter/<name>/` with an `index.ts` that exports the adapter classes and their option types. Keep
   the adapter classes flat in that folder (no `host/`/`client/` subfolders) and put helper functions into `utils/`
   and constants into `constants/` below it. Tests mirror this structure. Files that run in a worker scope are listed
   explicitly in the `tsconfig.*webworker.json` files; their tests are named `*.worker.test.ts`/`*.worker.test-d.ts`.
   Node-only tests are named `*.node.test.ts` and run in the Vitest project `node`; end-to-end tests against real
   Node.js APIs live in `test/node/`.
2. Extend `AbstractRpcAdapter` and implement `connect` and `sendMessage`; report connection state via `connectionStatus`,
   call `closeConnection()` when the transport is definitively closed (this rejects in-flight calls with
   `CONNECTION_LOST`, a mere status change does not) and forward incoming messages via `onMessage`. Override `destroy`
   to release resources. Handshake-based `MessagePort` transports extend `AbstractMessagePortHostAdapter` or
   `AbstractMessagePortClientAdapter` instead and only implement how handshake messages are listened for and posted.
3. Add one build entry in `vite.config.ts` and a matching subpath export in `package.json` that exports both sides.
   Code that runs in a different global scope than the DOM (e.g. inside a worker) is additionally type-checked by a
   tsconfig with the matching `lib` (see `tsconfig.lib.webworker.json`). Its public types must stay lib-neutral,
   since both sides share one entry point.
   Node-only files go into `tsconfig.lib.node.json` and are excluded from `tsconfig.lib.json`, like the worker files;
   the package core and the message-port base classes are type-checked there without DOM as well.
4. Add tests, an example under `examples/`, and update the README adapter list.

## Git

- **Never commit or push on your own.** Only do so when the user explicitly asks.
- Exception: when working in your own branch inside a dedicated git worktree, you may commit (and push that branch)
  without asking. Never commit or push to `main` from there.
