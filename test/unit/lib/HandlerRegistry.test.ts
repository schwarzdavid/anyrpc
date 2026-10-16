import { describe, expect, it, vi } from 'vitest'
import { HandlerRegistry } from '@/lib/HandlerRegistry'

interface TestEvents {
    testEvent: (arg: string) => string
}

describe(HandlerRegistry, () => {
    it('should return the registered handler', () => {
        const registry = new HandlerRegistry<TestEvents>()
        const handler = vi.fn<(arg: string) => string>()

        registry.register('testEvent', handler)

        expect(registry.get('testEvent')).toBe(handler)
    })

    it('should return undefined if no handler is registered', () => {
        const registry = new HandlerRegistry<TestEvents>()

        expect(registry.get('testEvent')).toBeUndefined()
    })

    it('should throw when registering a second handler for the same name', () => {
        const registry = new HandlerRegistry<TestEvents>()

        registry.register('testEvent', vi.fn<(arg: string) => string>())

        expect(() => registry.register('testEvent', vi.fn<(arg: string) => string>())).toThrowError(
            'A handler for "testEvent" is already registered. ' +
                'Call the function returned by the previous handle() before registering a new handler.',
        )
    })

    it('should remove the handler when unsubscribing', () => {
        const registry = new HandlerRegistry<TestEvents>()

        const unsubscribe = registry.register('testEvent', vi.fn<(arg: string) => string>())
        unsubscribe()

        expect(registry.get('testEvent')).toBeUndefined()
    })

    it('should not remove a newer handler when an outdated unsubscribe is called again', () => {
        const registry = new HandlerRegistry<TestEvents>()
        const newHandler = vi.fn<(arg: string) => string>()

        const unsubscribe = registry.register('testEvent', vi.fn<(arg: string) => string>())
        unsubscribe()
        registry.register('testEvent', newHandler)
        unsubscribe()

        expect(registry.get('testEvent')).toBe(newHandler)
    })
})
