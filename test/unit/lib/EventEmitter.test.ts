import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from '@/lib/EventEmitter'

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

describe('EventEmitter', () => {
    describe('addEventListener', () => {
        it('should register event listener', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn(async (arg: string) => arg)

            eventEmitter.addEventListener('testEvent', listener)

            expect((eventEmitter as any).registry.testEvent).toHaveLength(1)
            expect((eventEmitter as any).registry.testEvent[0].listener).toBe(listener)
        })

        it('should throw an error when adding more than one non-passive listener', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener1 = vi.fn(async (arg: string) => arg)
            const listener2 = vi.fn(async (arg: string) => arg)

            eventEmitter.addEventListener('testEvent', listener1)

            expect(() => {
                eventEmitter.addEventListener('testEvent', listener2)
            }).toThrowError('Only one non-passive listener can be registered for an event type')
        })

        it('should allow multiple passive listeners for the same event', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const passiveListener1 = vi.fn()
            const passiveListener2 = vi.fn()

            eventEmitter.addEventListener('testEvent', passiveListener1, { passive: true })
            eventEmitter.addEventListener('testEvent', passiveListener2, { passive: true })

            const registry = (eventEmitter as any).registry.testEvent

            expect(registry).toHaveLength(2)
            expect(registry[0].listener).toBe(passiveListener1)
            expect(registry[1].listener).toBe(passiveListener2)
        })
    })
})
