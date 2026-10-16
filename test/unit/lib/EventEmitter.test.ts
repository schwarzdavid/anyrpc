import { describe, expect, it, vi } from 'vitest'
import { EventEmitter, type EventListenerEntry } from '@/lib/EventEmitter'

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

        it('should do nothing if listener has not been registered', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener1 = vi.fn<(arg: string) => string>()
            const listener2 = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', listener2)

            expect(() => eventEmitter.removeEventListener('testEvent', listener1)).not.toThrowError()
        })
    })

    describe('dispatchEvent', () => {
        it('should dispatch event to all registered listeners', async () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const activeListener = vi.fn<(arg: string) => string>(() => 'result')
            const passiveListener = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', activeListener)
            eventEmitter.addEventListener('testEvent', passiveListener, { passive: true })

            const { result, error } = await eventEmitter.dispatchEvent('testEvent', ['arg'])

            expect(activeListener).toHaveBeenCalledWith('arg')
            expect(passiveListener).toHaveBeenCalledWith('arg')
            expect(result).toBe('result')
            expect(error).toBeUndefined()
        })

        it('should return undefined if no listeners are registered', async () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const registry: EventListenerEntry<TestEvents['testEvent']>[] = (eventEmitter as any).registry.testEvent

            const { result, error } = await eventEmitter.dispatchEvent('testEvent', ['arg'])

            expect(registry).toBeUndefined()
            expect(result).toBeUndefined()
            expect(error).toBeUndefined()
        })

        it('should return undefined if all registered listeners have been unregistered', async () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', listener)
            eventEmitter.removeEventListener('testEvent', listener)

            const registry: EventListenerEntry<TestEvents['testEvent']>[] = (eventEmitter as any).registry.testEvent
            const { result, error } = await eventEmitter.dispatchEvent('testEvent', ['arg'])

            expect(registry).toHaveLength(0)
            expect(listener).not.toHaveBeenCalled()
            expect(result).toBeUndefined()
            expect(error).toBeUndefined()
        })

        it('should return undefined if only passive listeners are registered', async () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', listener, { passive: true })

            const { result } = await eventEmitter.dispatchEvent('testEvent', ['arg'])

            expect(result).toBeUndefined()
            expect(result).toBeUndefined()
        })

        it('should execute active listener last', async () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const activeListener = vi.fn<(arg: string) => string>()
            const passiveListener = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', activeListener)
            eventEmitter.addEventListener('testEvent', passiveListener, { passive: true })

            await eventEmitter.dispatchEvent('testEvent', ['arg'])

            expect(activeListener).toHaveBeenCalledAfter(passiveListener)
        })

        it('should return error if active listener throws an error', async () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>().mockRejectedValue(new Error('err'))

            eventEmitter.addEventListener('testEvent', listener)

            const { result, error } = await eventEmitter.dispatchEvent('testEvent', ['arg'])

            expect(listener).toHaveBeenCalledWith('arg')
            expect(result).toBeUndefined()
            expect(error).toBeInstanceOf(Error)
            expect(error?.message).toBe('err')
        })

        it('should ignore errors thrown by passive listeners', async () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const passiveListener = vi.fn<(arg: string) => string>().mockRejectedValue(new Error('err'))
            const activeListener = vi.fn<(arg: string) => string>(() => 'result')

            eventEmitter.addEventListener('testEvent', passiveListener, { passive: true })
            eventEmitter.addEventListener('testEvent', activeListener)

            const { result, error } = await eventEmitter.dispatchEvent('testEvent', ['arg'])

            expect(error).toBeUndefined()
            expect(result).toBe('result')
            expect(passiveListener).toHaveBeenCalledWith('arg')
        })
    })

    describe('hasEventListeners', () => {
        it('should return false if no listener was ever registered', () => {
            const eventEmitter = new EventEmitter<TestEvents>()

            expect(eventEmitter.hasEventListeners('testEvent')).toBe(false)
        })

        it('should return true if a listener is registered', () => {
            const eventEmitter = new EventEmitter<TestEvents>()

            eventEmitter.addEventListener('testEvent', vi.fn<(arg: string) => string>(), { passive: true })

            expect(eventEmitter.hasEventListeners('testEvent')).toBe(true)
        })

        it('should return false after all listeners were removed', () => {
            const eventEmitter = new EventEmitter<TestEvents>()
            const listener = vi.fn<(arg: string) => string>()

            eventEmitter.addEventListener('testEvent', listener)
            eventEmitter.removeEventListener('testEvent', listener)

            expect(eventEmitter.hasEventListeners('testEvent')).toBe(false)
        })

        it('should not treat inherited object properties as listeners', () => {
            const eventEmitter = new EventEmitter<Record<string, () => void>>()

            expect(eventEmitter.hasEventListeners('constructor')).toBe(false)
        })
    })
})
