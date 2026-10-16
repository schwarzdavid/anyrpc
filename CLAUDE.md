# CLAUDE.md

## Project

anyrpc is a small, fully typed, transport-agnostic RPC library for TypeScript. Consumers describe both directions of
communication as interfaces and get back a typed proxy (`createRpcChannel`). Messages follow JSON-RPC 2.0, and the
transport is pluggable through adapters that extend `AbstractRpcAdapter` (`src/lib/AbstractRpcAdapter.ts`). The iframe
adapter (`src/lib/adapter/iframe/`) is the first one; more transports are planned (see README).

## Guiding principles

- **Developer experience of consumer projects comes first.** Every public API decision is judged by how easy, obvious
  and type-safe it is for the people who install this library. Prefer sensible defaults, minimal required
  configuration, strong type inference and errors that tell the consumer what went wrong and how to fix it.
- **Open for extension.** New transports, options and behaviors must be addable without modifying the core. Keep the
  core transport-agnostic, keep adapter contracts small, and expose extension points through abstractions rather than
  special cases in `createRpcChannel`.
- **Keep it simple to use.** A consumer should get a working channel in a few lines. If a feature makes the common case
  harder, rethink it.
- Treat everything reachable through `package.json` `exports` as public API. Changing it is a breaking change; call it
  out explicitly.

## Code style

- **Do not write comments.** Code that needs a comment to be understood is not good enough. Express intent through
  naming, small functions and types instead. This applies to new code and to code you touch.
- Match the surrounding code: 4-space indent, no semicolons, single quotes, max line length 120 (Prettier + EditorConfig).
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on) and the `@/` alias for `src/`.
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

1. Create `src/lib/adapter/<name>/` with an `index.ts` that exports the adapter classes and their option types.
2. Extend `AbstractRpcAdapter` and implement `connect` and `sendMessage`; report connection state via `connectionStatus`
   and forward incoming messages via `onMessage`. Override `destroy` to release resources.
3. Add a build entry in `vite.config.ts` and a matching subpath export in `package.json`.
4. Add tests, an example under `examples/`, and update the README adapter list.

## Git

- **Never commit or push on your own.** Only do so when the user explicitly asks.
- Exception: when working in your own branch inside a dedicated git worktree, you may commit (and push that branch)
  without asking. Never commit or push to `main` from there.
