import { assertType, describe, expectTypeOf, it } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { WebWorkerClientAdapter } from '@/lib/adapter/web-worker/client'

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

    it('should accept a name and a polling interval', () => {
        expectTypeOf(new WebWorkerClientAdapter('my-app', { pollingInterval: 100 })).toBeObject()
    })

    it('should reject host options', () => {
        // @ts-expect-error
        assertType(new WebWorkerClientAdapter('my-app', { heartbeat: true }))
    })

    it('should infer the channel methods', () => {
        const channel = createRpcChannel(new WebWorkerClientAdapter<WorkerToHost, HostToWorker>())

        expectTypeOf(channel.progress.notify).parameters.toEqualTypeOf<[percent: number]>()
        expectTypeOf(channel.$.handle).toBeFunction()
    })
})
