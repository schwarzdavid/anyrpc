import { assertType, describe, expectTypeOf, it } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { createRpcHub } from '@/createRpcHub'
import { SharedWorkerHubAdapter } from '@/lib/adapter/web-worker'
import type { RpcPeerPromise } from '@/types/RpcHub'

interface WorkerToPage {
    getTitle(): string
}

interface PageToWorker {
    getCount(): number
}

describe(SharedWorkerHubAdapter, () => {
    it('should work without any arguments', () => {
        expectTypeOf(new SharedWorkerHubAdapter<WorkerToPage, PageToWorker>()).toBeObject()
    })

    it('should accept a name and heartbeat options', () => {
        expectTypeOf(new SharedWorkerHubAdapter('my-app', { heartbeat: false })).toBeObject()
        expectTypeOf(new SharedWorkerHubAdapter('my-app', { heartbeat: { interval: 1000 } })).toBeObject()
    })

    it('should be used with createRpcHub', () => {
        const hub = createRpcHub(new SharedWorkerHubAdapter<WorkerToPage, PageToWorker>())

        expectTypeOf(hub.getTitle()).toEqualTypeOf<RpcPeerPromise<WorkerToPage, PageToWorker, string>[]>()
    })

    it('should not be usable as the adapter of a single channel', () => {
        // @ts-expect-error
        assertType(createRpcChannel(new SharedWorkerHubAdapter<WorkerToPage, PageToWorker>()))
    })
})
