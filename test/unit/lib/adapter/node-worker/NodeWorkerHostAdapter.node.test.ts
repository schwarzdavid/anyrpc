import { EventEmitter } from 'node:events'
import { MessageChannel } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeWorkerHostAdapter } from '@/lib/adapter/node-worker/NodeWorkerHostAdapter'
import type { ConnectionLostHandler } from '@/lib/adapter/AbstractRpcAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'

interface TestMethods {
    foo(value: string): void
}

vi.mock(import('@/utils/uuid'), () => ({
    uuid: vi.fn<() => string>(() => 'init-id'),
}))

class FakeWorker extends EventEmitter {
    readonly postMessage = vi.fn<(message: unknown) => void>()
    readonly terminate = vi.fn<() => Promise<number>>(() => Promise.resolve(1))
}

const initRequest = { jsonrpc: '2.0', id: 'init-id', method: 'anyrpc::node-worker-init', params: ['my-app'] }
const initResponse = { jsonrpc: '2.0', id: 'init-id', result: null }

describe(NodeWorkerHostAdapter, () => {
    let worker: FakeWorker
    let dataChannel: MessageChannel
    let controlChannel: MessageChannel
    let adapter: NodeWorkerHostAdapter<TestMethods, TestMethods>

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        worker = new FakeWorker()
        dataChannel = new MessageChannel()
        controlChannel = new MessageChannel()
        adapter = new NodeWorkerHostAdapter(worker, 'my-app')
        adapter.initLogger(LogLevel.DEBUG)
    })

    afterEach(() => {
        adapter.destroy()
        dataChannel.port2.close()
        controlChannel.port2.close()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    function answerHandshake(): void {
        worker.emit('message', { response: initResponse, ports: [dataChannel.port1, controlChannel.port1] })
    }

    it('should post an init request with its name to the worker when connecting', () => {
        adapter.connect()

        expect(worker.postMessage).toHaveBeenCalledWith(initRequest)
    })

    it('should repeat the init request once per polling interval until the worker answers', () => {
        adapter.connect()
        vi.advanceTimersByTime(2000)
        answerHandshake()
        vi.advanceTimersByTime(2000)

        expect(worker.postMessage).toHaveBeenCalledTimes(3)
    })

    it('should use the configured polling interval', () => {
        adapter = new NodeWorkerHostAdapter(worker, 'my-app', { pollingInterval: 100 })

        adapter.connect()
        vi.advanceTimersByTime(300)

        expect(worker.postMessage).toHaveBeenCalledTimes(4)
    })

    it('should connect once the worker answers with an envelope that carries the ports', () => {
        adapter.connect()
        answerHandshake()

        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        expect(worker.listenerCount('message')).toBe(0)
    })

    it('should ignore messages from the worker that are not a handshake envelope', () => {
        adapter.connect()
        worker.emit('message', initResponse)
        worker.emit('message', { response: initResponse, ports: [{}, {}] })

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should ignore envelopes that answer another handshake request', () => {
        adapter.connect()
        worker.emit('message', {
            response: { ...initResponse, id: 'other-id' },
            ports: [dataChannel.port1, controlChannel.port1],
        })

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should log uncaught errors of the worker', () => {
        const error = new Error('boom')
        adapter.connect()

        worker.emit('error', error)

        expect(console.error).toHaveBeenCalledWith('[NodeWorkerHostAdapter]', 'Uncaught error in node worker', error)
    })

    it('should disconnect, reject pending calls and stop polling when the worker exits', () => {
        const connectionLostHandler = vi.fn<ConnectionLostHandler>()
        adapter.connectionLostHandler = connectionLostHandler
        adapter.connect()
        answerHandshake()

        worker.emit('exit', 1)
        vi.advanceTimersByTime(3000)

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        expect(connectionLostHandler).toHaveBeenCalledWith()
        expect(worker.postMessage).toHaveBeenCalledTimes(1)
        expect(console.log).toHaveBeenCalledWith(
            '[NodeWorkerHostAdapter]',
            'The node worker exited with code 1, so the channel will not reconnect',
        )
    })

    it('should stop polling when the worker exits before answering', () => {
        adapter.connect()

        worker.emit('exit', 0)
        vi.advanceTimersByTime(3000)

        expect(worker.postMessage).toHaveBeenCalledTimes(1)
    })

    it('should not register the lifecycle listeners twice when connecting twice', () => {
        adapter.connect()
        adapter.connect()

        expect(worker.listenerCount('exit')).toBe(1)
        expect(worker.listenerCount('error')).toBe(1)
    })

    it('should remove all listeners from the worker when destroyed', () => {
        adapter.connect()

        adapter.destroy()

        expect(worker.listenerCount('message')).toBe(0)
        expect(worker.listenerCount('exit')).toBe(0)
        expect(worker.listenerCount('error')).toBe(0)
    })

    it('should not terminate the worker on destroy by default', () => {
        adapter.connect()

        adapter.destroy()

        expect(worker.terminate).not.toHaveBeenCalled()
    })

    it('should terminate the worker on destroy when terminateOnDestroy is set', () => {
        adapter = new NodeWorkerHostAdapter(worker, 'my-app', { terminateOnDestroy: true })
        adapter.connect()

        adapter.destroy()

        expect(worker.terminate).toHaveBeenCalledTimes(1)
    })

    it('should use the default name', () => {
        adapter = new NodeWorkerHostAdapter(worker)

        adapter.connect()

        expect(worker.postMessage).toHaveBeenCalledWith({ ...initRequest, params: ['anyrpc-node-worker-adapter'] })
    })
})
