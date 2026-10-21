import { assert, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagePort } from 'node:worker_threads'
import { NodeWorkerClientAdapter } from '@/lib/adapter/node-worker/NodeWorkerClientAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'

interface TestMethods {
    foo(value: string): void
}

const workerThreads = vi.hoisted(() => {
    class FakeParentPort extends EventTarget {
        readonly postMessage = vi.fn<(message: unknown, transfer: readonly unknown[]) => void>()
    }
    return { FakeParentPort, parentPort: null as InstanceType<typeof FakeParentPort> | null }
})

vi.mock(import('node:worker_threads'), async (importOriginal) => {
    const actual = await importOriginal()
    return Object.defineProperty({ ...actual }, 'parentPort', { get: () => workerThreads.parentPort })
})

const initRequest = { jsonrpc: '2.0', id: 'init-id', method: 'anyrpc::node-worker-init', params: ['my-app'] }

describe(NodeWorkerClientAdapter, () => {
    let parentPort: InstanceType<typeof workerThreads.FakeParentPort>
    let adapter: NodeWorkerClientAdapter<TestMethods, TestMethods>

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        parentPort = new workerThreads.FakeParentPort()
        workerThreads.parentPort = parentPort
        adapter = new NodeWorkerClientAdapter('my-app')
        adapter.initLogger(LogLevel.DEBUG)
    })

    afterEach(() => {
        adapter.destroy()
        vi.restoreAllMocks()
    })

    function receive(data: unknown): void {
        parentPort.dispatchEvent(new MessageEvent('message', { data }))
    }

    function postedPorts(): MessagePort[] {
        const [envelope, transfer] = parentPort.postMessage.mock.calls[0] ?? []
        assert(Array.isArray(transfer))

        expect(envelope).toStrictEqual({ response: { jsonrpc: '2.0', id: 'init-id', result: null }, ports: transfer })

        return transfer.filter((port) => port instanceof MessagePort)
    }

    it('should throw a helpful error outside of a worker thread', () => {
        workerThreads.parentPort = null

        expect(() => new NodeWorkerClientAdapter('my-app')).toThrowError(
            'NodeWorkerClientAdapter must be created inside a worker thread. ' +
                'Use NodeWorkerHostAdapter in the thread that starts the worker.',
        )
    })

    it('should answer an init request with an envelope that carries two transferred ports', () => {
        adapter.connect()

        receive(initRequest)

        expect(postedPorts()).toHaveLength(2)
    })

    it('should ignore init requests for another name', () => {
        adapter.connect()

        receive({ ...initRequest, params: ['other-app'] })

        expect(parentPort.postMessage).not.toHaveBeenCalled()
    })

    it('should connect once the main thread answers the first ping', async () => {
        adapter.connect()
        receive(initRequest)
        const [, control] = postedPorts()
        assert(control)

        control.on('message', () => control.postMessage({ jsonrpc: '2.0', method: 'anyrpc::pong', params: [] }))

        await vi.waitFor(() => expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED))
        control.close()
    })

    it('should answer a repeated init request only once', () => {
        adapter.connect()

        receive(initRequest)
        receive(initRequest)

        expect(parentPort.postMessage).toHaveBeenCalledTimes(1)
        expect(console.log).toHaveBeenCalledWith(
            '[NodeWorkerClientAdapter]',
            'Ignored a repeated handshake request that was already answered',
        )
    })

    it('should stop listening for init requests when destroyed', () => {
        adapter.connect()

        adapter.destroy()
        receive(initRequest)

        expect(parentPort.postMessage).not.toHaveBeenCalled()
    })

    it('should use the default name', () => {
        adapter = new NodeWorkerClientAdapter()
        adapter.connect()

        receive({ ...initRequest, params: ['anyrpc-node-worker-adapter'] })

        expect(parentPort.postMessage).toHaveBeenCalledTimes(1)
    })
})
