import { assertType, describe, expectTypeOf, it } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { WebWorkerClientAdapter } from '@/lib/adapter/web-worker'

interface HostToWorker {
    compute(input: number): number
}

interface WorkerToHost {
    progress(percent: number): void
}

describe(WebWorkerClientAdapter, () => {
    it('should work without any arguments', () => {
        expectTypeOf(new WebWorkerClientAdapter<WorkerToHost, HostToWorker>()).toBeObject()
    })

    it('should accept a name', () => {
        expectTypeOf(new WebWorkerClientAdapter('my-app')).toBeObject()
    })

    it('should reject options, since the page configures the connection', () => {
        // @ts-expect-error
        assertType(new WebWorkerClientAdapter('my-app', { pollingInterval: 100 }))
    })

    it('should infer the channel methods', () => {
        const channel = createRpcChannel(new WebWorkerClientAdapter<WorkerToHost, HostToWorker>())

        expectTypeOf(channel.progress.notify).parameters.toEqualTypeOf<[percent: number]>()
        expectTypeOf(channel.$.handle).toBeFunction()
    })
})
