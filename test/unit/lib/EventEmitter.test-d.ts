import { describe, it, assertType, vi } from 'vitest'
import { EventEmitter } from '@/lib/EventEmitter'

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

describe(EventEmitter, () => {
    describe('addEventListener', () => {
        it('should allow to add a listener for an event type', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            assertType(eventEmitter.addEventListener('testEvent', listener))
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

    describe('removeEventListener', () => {
        it('should allow to remove a listener for an event type', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            assertType(eventEmitter.removeEventListener('testEvent', listener))
        })

        it('should not allow to remove a listener for an event type that does not exist', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            // @ts-expect-error
            assertType(eventEmitter.removeEventListener('non-existing', listener))
        })

        it('should not allow to remove a listener with different argument types', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: number) => string>()

            // @ts-expect-error
            assertType(eventEmitter.removeEventListener('testEvent', listener))
        })

        it('should ignore return type of passive listener', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => number>()

            assertType(eventEmitter.removeEventListener('testEvent', listener))
        })
    })
})
