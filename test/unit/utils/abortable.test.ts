import { describe, expect, it, vi } from 'vitest'
import { abortable } from '@/utils/abortable'

describe(abortable, () => {
    it('should return the started promise without a signal', async () => {
        const start = vi.fn<() => Promise<string>>(() => Promise.resolve('result'))

        await expect(abortable(undefined, start)).resolves.toBe('result')
        expect(start).toHaveBeenCalledTimes(1)
    })

    it('should reject with the reason of a signal that is already aborted without starting', async () => {
        const reason = new Error('too late')
        const start = vi.fn<() => Promise<string>>()

        await expect(abortable(AbortSignal.abort(reason), start)).rejects.toBe(reason)
        expect(start).not.toHaveBeenCalled()
    })

    it('should resolve with the result when the signal is not aborted', async () => {
        const controller = new AbortController()

        await expect(abortable(controller.signal, () => Promise.resolve('result'))).resolves.toBe('result')
    })

    it('should reject with the error of the started promise', async () => {
        const error = new Error('failed')
        const controller = new AbortController()

        await expect(abortable(controller.signal, () => Promise.reject(error))).rejects.toBe(error)
    })

    it('should reject with the reason of the signal when it is aborted first', async () => {
        const reason = new Error('cancelled')
        const controller = new AbortController()
        const call = abortable(controller.signal, () => new Promise<string>(() => undefined))

        controller.abort(reason)

        await expect(call).rejects.toBe(reason)
    })

    it('should let a synchronous error of the start function through', () => {
        const error = new Error('not connected')
        const controller = new AbortController()
        const removeListener = vi.spyOn(controller.signal, 'addEventListener')

        expect(() =>
            abortable(controller.signal, () => {
                throw error
            }),
        ).toThrowError(error)
        expect(removeListener).not.toHaveBeenCalled()
    })

    it('should stop listening to the signal once the promise is settled', async () => {
        const controller = new AbortController()
        const removeListener = vi.spyOn(controller.signal, 'removeEventListener')

        await abortable(controller.signal, () => Promise.resolve('result'))
        await Promise.resolve()

        expect(removeListener).toHaveBeenCalledExactlyOnceWith('abort', expect.any(Function))
    })
})
