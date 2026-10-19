import { assertType, describe, expectTypeOf, it } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { SharedWorkerHostAdapter } from '@/lib/adapter/web-worker'

interface PageToWorker {
    getCount(): number
}

interface WorkerToPage {
    refresh(): void
}

declare const sharedWorker: SharedWorker
declare const worker: Worker

describe(SharedWorkerHostAdapter, () => {
    it('should accept a SharedWorker without further configuration', () => {
        expectTypeOf(new SharedWorkerHostAdapter<PageToWorker, WorkerToPage>(sharedWorker)).toBeObject()
    })

    it('should accept a name and a polling interval', () => {
        expectTypeOf(new SharedWorkerHostAdapter(sharedWorker, 'my-app', { pollingInterval: 100 })).toBeObject()
    })

    it('should reject dedicated workers and hub options', () => {
        // @ts-expect-error
        assertType(new SharedWorkerHostAdapter(worker))
        // @ts-expect-error
        assertType(new SharedWorkerHostAdapter(sharedWorker, 'my-app', { heartbeat: true }))
    })

    it('should infer the channel methods', () => {
        const channel = createRpcChannel(new SharedWorkerHostAdapter<PageToWorker, WorkerToPage>(sharedWorker))

        expectTypeOf(channel.getCount).returns.toEqualTypeOf<Promise<number>>()
    })
})
