export const GlobalScope = {
    SHARED_WORKER: 'SharedWorkerGlobalScope',
    SERVICE_WORKER: 'ServiceWorkerGlobalScope',
} as const

export type GlobalScope = (typeof GlobalScope)[keyof typeof GlobalScope]

export function isRunningInWindow(): boolean {
    return Reflect.get(globalThis, 'window') === globalThis
}

export function isRunningIn(scope: GlobalScope): boolean {
    const scopeConstructor: unknown = Reflect.get(globalThis, scope)
    return typeof scopeConstructor === 'function' && globalThis instanceof scopeConstructor
}
