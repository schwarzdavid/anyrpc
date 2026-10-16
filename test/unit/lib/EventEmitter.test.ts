import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from '@/lib/EventEmitter'

interface TestEvents {
    testEvent: (arg: string) => void
    otherEvent: () => void
}

function createEmitter() {
    const onListenerError = vi.fn<(error: unknown, type: keyof TestEvents) => void>()
    const eventEmitter = new EventEmitter<TestEvents>(onListenerError)
    return { eventEmitter, onListenerError }
}

describe(EventEmitter, () => {
    it('should call all listeners of an event with the given params', () => {
        const { eventEmitter } = createEmitter()
        const firstListener = vi.fn<(arg: string) => void>()
        const secondListener = vi.fn<(arg: string) => void>()

        eventEmitter.on('testEvent', firstListener)
        eventEmitter.on('testEvent', secondListener)
        eventEmitter.emit('testEvent', ['arg'])

        expect(firstListener).toHaveBeenCalledWith('arg')
        expect(secondListener).toHaveBeenCalledWith('arg')
    })

    it('should only call listeners of the emitted event', () => {
        const { eventEmitter } = createEmitter()
        const otherListener = vi.fn<() => void>()

        eventEmitter.on('otherEvent', otherListener)
        eventEmitter.emit('testEvent', ['arg'])

        expect(otherListener).not.toHaveBeenCalled()
    })

    it('should not fail when emitting an event without listeners', () => {
        const { eventEmitter } = createEmitter()

        expect(() => eventEmitter.emit('testEvent', ['arg'])).not.toThrowError()
    })

    it('should stop calling a listener after unsubscribing', () => {
        const { eventEmitter } = createEmitter()
        const listener = vi.fn<(arg: string) => void>()

        const unsubscribe = eventEmitter.on('testEvent', listener)
        unsubscribe()
        eventEmitter.emit('testEvent', ['arg'])

        expect(listener).not.toHaveBeenCalled()
    })

    it('should not call listeners added during an emit until the next emit', () => {
        const { eventEmitter } = createEmitter()
        const lateListener = vi.fn<(arg: string) => void>()

        eventEmitter.on('testEvent', () => {
            eventEmitter.on('testEvent', lateListener)
        })
        eventEmitter.emit('testEvent', ['first'])

        expect(lateListener).not.toHaveBeenCalled()

        eventEmitter.emit('testEvent', ['second'])

        expect(lateListener).toHaveBeenCalledWith('second')
    })

    it('should report synchronous listener errors and keep calling other listeners', () => {
        const { eventEmitter, onListenerError } = createEmitter()
        const error = new Error('listener failed')
        const secondListener = vi.fn<(arg: string) => void>()

        eventEmitter.on('testEvent', () => {
            throw error
        })
        eventEmitter.on('testEvent', secondListener)
        eventEmitter.emit('testEvent', ['arg'])

        expect(onListenerError).toHaveBeenCalledWith(error, 'testEvent')
        expect(secondListener).toHaveBeenCalledWith('arg')
    })

    it('should report rejected promises of async listeners', async () => {
        const { eventEmitter, onListenerError } = createEmitter()
        const error = new Error('listener failed')

        eventEmitter.on('testEvent', () => Promise.reject(error))
        eventEmitter.emit('testEvent', ['arg'])
        await vi.waitFor(() => expect(onListenerError).toHaveBeenCalledWith(error, 'testEvent'))
    })
})
