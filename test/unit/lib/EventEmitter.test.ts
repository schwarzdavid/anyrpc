import { assertType, describe, expect, it, vi } from 'vitest'
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

        it('should not allow to add a listener for an event type that does not exist', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            // @ts-expect-error
            assertType(eventEmitter.addEventListener('non-existing', listener))
        })

        it('should not allow to add a listener with different argument types', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: number) => string>()

            // @ts-expect-error
            assertType(eventEmitter.addEventListener('testEvent', listener))

            // @ts-expect-error
            assertType(eventEmitter.addEventListener('testEvent', listener, { passive: true }))
        })

        it('should not allow to add a passive listener with different argument types', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: number) => string>()

            // @ts-expect-error
            assertType(eventEmitter.addEventListener('testEvent', listener))
        })

        it('should not allow to add an active listener with different return type', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => number>()

            // @ts-expect-error
            assertType(eventEmitter.addEventListener('testEvent', listener))
        })

        it('should ignore return type of passive listener', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => number>()

            assertType(eventEmitter.addEventListener('testEvent', listener, { passive: true }))
        })
    })
})
