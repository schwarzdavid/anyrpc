import { describe, expectTypeOf, it } from 'vitest'
import type { Worker } from 'node:worker_threads'
import {
    NodeWorkerClientAdapter,
    NodeWorkerHostAdapter,
    type NodeWorkerHostAdapterOptions,
    type NodeWorkerLike,
} from '@/lib/adapter/node-worker'
import type { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import type { HeartbeatOption } from '@/lib/Heartbeat'

interface Methods {
    ping(): string
}

describe('anyrpc/adapters/node-worker entry point', () => {
    it('should accept a worker_threads Worker', () => {
        expectTypeOf<Worker>().toExtend<NodeWorkerLike>()
    })

    it('should create adapters for both sides', () => {
        expectTypeOf<NodeWorkerHostAdapter<Methods, Methods>>().toExtend<AbstractRpcAdapter<Methods, Methods>>()
        expectTypeOf<NodeWorkerClientAdapter<Methods, Methods>>().toExtend<AbstractRpcAdapter<Methods, Methods>>()
    })

    it('should expose the host options', () => {
        expectTypeOf<NodeWorkerHostAdapterOptions>().toEqualTypeOf<{
            pollingInterval: number
            heartbeat: HeartbeatOption
            terminateOnDestroy: boolean
        }>()
    })
})
