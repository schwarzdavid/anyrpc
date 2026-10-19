import { describe, expect, it } from 'vitest'
import {
    DEFAULT_NODE_WORKER_ADAPTER_NAME,
    NODE_WORKER_INIT_METHOD_NAME,
} from '@/lib/adapter/node-worker/constants/nodeWorkerHandshake'

describe('nodeWorkerHandshake', () => {
    it('should expose the init method name and the default adapter name', () => {
        expect(NODE_WORKER_INIT_METHOD_NAME).toBe('anyrpc::node-worker-init')
        expect(DEFAULT_NODE_WORKER_ADAPTER_NAME).toBe('anyrpc-node-worker-adapter')
    })
})
