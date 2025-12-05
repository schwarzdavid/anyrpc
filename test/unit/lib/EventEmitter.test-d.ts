import { assertType, describe, expectTypeOf, it, vi } from 'vitest'
import { EventEmitter } from '@/lib/EventEmitter'

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

describe('EventEmitter', () => {
    describe('addEventListner', () => {
        it('should not allow to add an listener for an event type that does not exist', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn((arg: string) => arg)

            assertType(eventEmitter.addEventListener('non-existing', listener))

            assertType<number>('string')

            expectTypeOf('hi').toEqualTypeOf(4)
        })
    })
})
