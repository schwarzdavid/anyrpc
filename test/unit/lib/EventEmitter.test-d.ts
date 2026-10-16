import { describe, expectTypeOf, it, vi } from 'vitest'
import { EventEmitter } from '@/lib/EventEmitter'
import type { Unsubscribe } from '@/types/EventEmitter'

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

describe(EventEmitter, () => {
    const eventEmitter = new EventEmitter<TestEvents>(vi.fn<(error: unknown) => void>())

    it('should return an unsubscribe function from on', () => {
        expectTypeOf(eventEmitter.on('testEvent', vi.fn<(arg: string) => void>())).toEqualTypeOf<Unsubscribe>()
    })

    it('should ignore the return type of listeners', () => {
        expectTypeOf(eventEmitter.on).toBeCallableWith('testEvent', vi.fn<(arg: string) => number>())
    })

    it('should not allow listeners for unknown events', () => {
        // @ts-expect-error
        expectTypeOf(eventEmitter.on).toBeCallableWith('unknown', vi.fn<(arg: string) => void>())
    })

    it('should not allow listeners with wrong argument types', () => {
        // @ts-expect-error
        expectTypeOf(eventEmitter.on).toBeCallableWith('testEvent', vi.fn<(arg: number) => void>())
    })

    it('should require matching params when emitting', () => {
        expectTypeOf(eventEmitter.emit).toBeCallableWith('testEvent', ['arg'])
        // @ts-expect-error
        expectTypeOf(eventEmitter.emit).toBeCallableWith('testEvent', [1])
    })
})
