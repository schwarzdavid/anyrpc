import { describe, expect, it, vi } from 'vitest'
import { EventEmitter, EventListenerEntry } from '@/lib/EventEmitter'

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

describe(EventEmitter, () => {
    describe('addEventListener', () => {
        it('should register event listener', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', listener)

            expect((eventEmitter as any).registry.testEvent).toHaveLength(1)
            expect((eventEmitter as any).registry.testEvent[0].listener).toBe(listener)
        })

        it('should throw an error when adding more than one non-passive listener', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener1 = vi.fn<(arg: string) => string>()
            const listener2 = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', listener1)

            expect(() => {
                eventEmitter.addEventListener('testEvent', listener2)
            }).toThrowError('Only one non-passive listener can be registered for an event type')
        })

        it('should allow multiple passive listeners for the same event', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const passiveListener1 = vi.fn<(arg: string) => string>()
            const passiveListener2 = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', passiveListener1, { passive: true })
            eventEmitter.addEventListener('testEvent', passiveListener2, { passive: true })

            const registry: EventListenerEntry<TestEvents['testEvent']>[] = (eventEmitter as any).registry.testEvent

            expect(registry).toHaveLength(2)
            expect(registry[0]?.listener).toBe(passiveListener1)
            expect(registry[1]?.listener).toBe(passiveListener2)
        })
    })

    describe('removeEventListener', () => {
        it('should remove previously registered active listener', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const activeListener = vi.fn<(arg: string) => string>()
            const passiveListener = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', activeListener)
            eventEmitter.addEventListener('testEvent', passiveListener, { passive: true })
            eventEmitter.removeEventListener('testEvent', activeListener)

            const registry: EventListenerEntry<TestEvents['testEvent']>[] = (eventEmitter as any).registry.testEvent

            expect(registry).toHaveLength(1)
            expect(registry[0]?.listener).toBe(passiveListener)
        })

        it('should not throw an error when removing non-existing listener', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            expect(() => {
                eventEmitter.removeEventListener('testEvent', listener)
            }).not.toThrowError()
        })

        it('should not remove all listeners of type', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', listener, { passive: true })
            eventEmitter.addEventListener('testEvent', listener, { passive: true })

            eventEmitter.removeEventListener('testEvent', listener)

            const registry: EventListenerEntry<TestEvents['testEvent']>[] = (eventEmitter as any).registry.testEvent

            expect(registry).toHaveLength(1)
            expect(registry[0]?.listener).toBe(listener)
        })
    })

    describe.todo('dispatchEvent')
})
