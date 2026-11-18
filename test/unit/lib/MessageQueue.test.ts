import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue, type QueuedMessage } from '@/lib/MessageQueue'

function createMessage(send: () => Promise<void> = () => Promise.resolve()) {
    return {
        send: vi.fn<QueuedMessage['send']>(send),
        expire: vi.fn<QueuedMessage['expire']>(),
        discard: vi.fn<QueuedMessage['discard']>(),
    }
}

function deferred() {
    let resolve: () => void = () => undefined
    const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise
    })
    return { promise, resolve: () => resolve() }
}

describe(MessageQueue, () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('should send all queued messages in order and report that it is drained synchronously', () => {
        const queue = new MessageQueue({ timeout: 1000, awaitEach: false })
        const order: string[] = []
        const first = createMessage(() => {
            order.push('first')
            return Promise.resolve()
        })
        const second = createMessage(() => {
            order.push('second')
            return Promise.resolve()
        })
        queue.enqueue(first)
        queue.enqueue(second)

        void queue.drain(
            () => true,
            () => order.push('drained'),
        )

        expect(order).toStrictEqual(['first', 'second', 'drained'])
    })

    it('should report an empty queue as drained', () => {
        const queue = new MessageQueue({ timeout: 1000, awaitEach: false })
        const onDrained = vi.fn<() => void>()

        void queue.drain(() => true, onDrained)

        expect(onDrained).toHaveBeenCalledTimes(1)
    })

    it('should keep messages queued while sending is not possible', async () => {
        const queue = new MessageQueue({ timeout: 1000, awaitEach: false })
        const message = createMessage()
        queue.enqueue(message)

        await queue.drain(() => false, vi.fn<() => void>())
        const sentWhileBlocked = message.send.mock.calls.length
        await queue.drain(() => true, vi.fn<() => void>())

        expect(sentWhileBlocked).toBe(0)
        expect(message.send).toHaveBeenCalledTimes(1)
    })

    it('should wait for each message before sending the next one with awaitEach', async () => {
        const queue = new MessageQueue({ timeout: 1000, awaitEach: true })
        const firstSent = deferred()
        const first = createMessage(() => firstSent.promise)
        const second = createMessage()
        const onDrained = vi.fn<() => void>()
        queue.enqueue(first)
        queue.enqueue(second)

        const draining = queue.drain(() => true, onDrained)
        const secondSentBeforeFirstFinished = second.send.mock.calls.length
        firstSent.resolve()
        await draining

        expect(secondSentBeforeFirstFinished).toBe(0)
        expect(second.send).toHaveBeenCalledTimes(1)
        expect(onDrained).toHaveBeenCalledTimes(1)
    })

    it('should not drain twice at the same time', async () => {
        const queue = new MessageQueue({ timeout: 1000, awaitEach: true })
        const firstSent = deferred()
        const onSecondDrained = vi.fn<() => void>()
        queue.enqueue(createMessage(() => firstSent.promise))

        const draining = queue.drain(() => true, vi.fn<() => void>())
        await queue.drain(() => true, onSecondDrained)
        firstSent.resolve()
        await draining

        expect(onSecondDrained).not.toHaveBeenCalled()
    })

    it('should expire a message that was not sent within the timeout', async () => {
        const queue = new MessageQueue({ timeout: 1000, awaitEach: false })
        const expired = createMessage()
        const fresh = createMessage()
        queue.enqueue(expired)
        vi.advanceTimersByTime(500)
        queue.enqueue(fresh)

        vi.advanceTimersByTime(500)
        await queue.drain(() => true, vi.fn<() => void>())

        expect(expired.expire).toHaveBeenCalledTimes(1)
        expect(expired.send).not.toHaveBeenCalled()
        expect(fresh.send).toHaveBeenCalledTimes(1)
    })

    it('should not expire a message that was sent', async () => {
        const queue = new MessageQueue({ timeout: 1000, awaitEach: false })
        const message = createMessage()
        queue.enqueue(message)

        await queue.drain(() => true, vi.fn<() => void>())
        vi.advanceTimersByTime(1000)

        expect(message.expire).not.toHaveBeenCalled()
    })

    it('should discard all queued messages without expiring them', () => {
        const queue = new MessageQueue({ timeout: 1000, awaitEach: false })
        const first = createMessage()
        const second = createMessage()
        queue.enqueue(first)
        queue.enqueue(second)

        queue.discardAll()
        vi.advanceTimersByTime(1000)

        expect(first.discard).toHaveBeenCalledTimes(1)
        expect(second.discard).toHaveBeenCalledTimes(1)
        expect(first.expire).not.toHaveBeenCalled()
    })
})
