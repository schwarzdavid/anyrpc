import { vi } from 'vitest'

export function stubGlobalScope(scope: 'SharedWorkerGlobalScope' | 'ServiceWorkerGlobalScope'): void {
    vi.stubGlobal(scope, globalThis.constructor)
}
