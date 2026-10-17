import { assertType, describe, expectTypeOf, it } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { WebWorkerHostAdapter } from '@/lib/adapter/web-worker/host'

interface HostToWorker {
    compute(input: number): number
}

interface WorkerToHost {
    progress(percent: number): void
}

declare const worker: Worker

describe(WebWorkerHostAdapter, () => {
    it('should accept a Worker without further configuration', () => {
        expectTypeOf(new WebWorkerHostAdapter<HostToWorker, WorkerToHost>(worker)).toBeObject()
    })

    it('should accept a name and options', () => {
        expectTypeOf(
            new WebWorkerHostAdapter<HostToWorker, WorkerToHost>(worker, 'my-app', {
                terminateOnDestroy: true,
                heartbeat: { interval: 1000 },
            }),
        ).toBeObject()
        expectTypeOf(new WebWorkerHostAdapter(worker, 'my-app', { heartbeat: true })).toBeObject()
    })

    it('should reject invalid options', () => {
        // @ts-expect-error
        assertType(new WebWorkerHostAdapter(worker, 'my-app', { heartbeat: { interval: '1000' } }))
        // @ts-expect-error
        assertType(new WebWorkerHostAdapter(worker, 'my-app', { reconnect: true }))
    })

    it('should reject objects that are not workers', () => {
        // @ts-expect-error
        assertType(new WebWorkerHostAdapter(document.createElement('iframe')))
    })

    it('should infer the channel methods', () => {
        const channel = createRpcChannel(new WebWorkerHostAdapter<HostToWorker, WorkerToHost>(worker))

        expectTypeOf(channel.compute).parameters.toEqualTypeOf<[input: number]>()
        expectTypeOf(channel.compute(1)).resolves.toEqualTypeOf<number>()
    })
})
