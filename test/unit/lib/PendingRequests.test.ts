import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingRequests } from '@/lib/PendingRequests'
import { RpcError } from '@/lib/RpcError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'

describe(PendingRequests, () => {
    let pendingRequests: PendingRequests

    beforeEach(() => {
        vi.useFakeTimers()
        pendingRequests = new PendingRequests(1000)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('should send the request right away', () => {
        const send = vi.fn<() => void>()

        void pendingRequests.track('1', send)

        expect(send).toHaveBeenCalledTimes(1)
    })

    it('should resolve a request with its result', async () => {
        const request = pendingRequests.track('1', () => undefined)

        pendingRequests.resolve('1', 'result')

        await expect(request).resolves.toBe('result')
    })

    it('should match numeric response ids to the request', async () => {
        const request = pendingRequests.track('1', () => undefined)

        pendingRequests.resolve(1, 'result')

        await expect(request).resolves.toBe('result')
    })

    it('should reject a request with the given error', async () => {
        const error = new RpcError(RpcErrorCode.SERVER_ERROR)
        const request = pendingRequests.track('1', () => undefined)

        pendingRequests.reject('1', error)

        await expect(request).rejects.toBe(error)
    })

    it('should ignore results and errors for unknown ids', async () => {
        const request = pendingRequests.track('1', () => undefined)

        pendingRequests.resolve('2', 'other')
        pendingRequests.reject(null, new Error('other'))
        pendingRequests.resolve('1', 'result')

        await expect(request).resolves.toBe('result')
    })

    it('should reject a request with a timeout error when no response arrives in time', async () => {
        const request = pendingRequests.track('1', () => undefined)

        vi.advanceTimersByTime(1000)

        await expect(request).rejects.toStrictEqual(new RpcError(RpcErrorCode.TIMEOUT_ERROR))
    })

    it('should reject a request that could not be sent with the error of the transport', async () => {
        const error = new Error('cannot clone')

        const request = pendingRequests.track('1', () => {
            throw error
        })

        await expect(request).rejects.toBe(error)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('should forget a request once it is settled', async () => {
        const request = pendingRequests.track('1', () => undefined)
        pendingRequests.resolve('1', 'first')
        await request

        pendingRequests.resolve('1', 'second')

        await expect(request).resolves.toBe('first')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('should reject all pending requests at once', async () => {
        const error = new RpcError(RpcErrorCode.CONNECTION_LOST)
        const first = pendingRequests.track('1', () => undefined)
        const second = pendingRequests.track('2', () => undefined)

        pendingRequests.rejectAll(error)

        await expect(first).rejects.toBe(error)
        await expect(second).rejects.toBe(error)
    })
})
