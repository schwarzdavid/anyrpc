import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharedWorkerHostAdapter, type SharedWorkerLike } from '@/lib/adapter/web-worker'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import { nextMessage } from '../../../__helper/nextMessage'

interface TestMethods {
    foo(value: string): void
}

vi.mock(import('@/utils/uuid'), () => ({
    uuid: vi.fn<() => string>(() => 'init-id'),
}))

class FakePort extends EventTarget {
    postMessage = vi.fn<(message: unknown) => void>()
    start = vi.fn<() => void>()
}

class FakeSharedWorker extends EventTarget implements SharedWorkerLike {
    readonly fakePort = new FakePort()
    readonly port = this.fakePort as unknown as MessagePort

    receive(data: unknown, ports: MessagePort[] = []) {
        this.fakePort.dispatchEvent(new MessageEvent('message', { data, ports }))
    }
}

const initResponse = { jsonrpc: '2.0', id: 'init-id', result: null }

describe(SharedWorkerHostAdapter, () => {
    let worker: FakeSharedWorker
    let dataChannel: MessageChannel
    let controlChannel: MessageChannel
    let adapter: SharedWorkerHostAdapter<TestMethods, TestMethods>

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        worker = new FakeSharedWorker()
        dataChannel = new MessageChannel()
        controlChannel = new MessageChannel()
        adapter = new SharedWorkerHostAdapter(worker)
        adapter.initLogger(LogLevel.DEBUG)
    })

    afterEach(() => {
        adapter.destroy()
        dataChannel.port2.close()
        controlChannel.port2.close()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('should start the port and send an init request with its name to the shared worker', () => {
        adapter = new SharedWorkerHostAdapter(worker, 'my-app')

        adapter.connect()

        expect(worker.fakePort.start).toHaveBeenCalledTimes(1)
        expect(worker.fakePort.postMessage).toHaveBeenCalledExactlyOnceWith({
            jsonrpc: '2.0',
            id: 'init-id',
            method: 'anyrpc::shared-worker-init',
            params: ['my-app'],
        })
    })

    it('should use the default name and repeat the init request in the configured interval', () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        adapter = new SharedWorkerHostAdapter(worker, undefined, { pollingInterval: 100 })

        adapter.connect()
        vi.advanceTimersByTime(300)

        expect(worker.fakePort.postMessage).toHaveBeenCalledTimes(4)
        expect(worker.fakePort.postMessage).toHaveBeenLastCalledWith(
            expect.objectContaining({ params: ['anyrpc-shared-worker-adapter'] }),
        )
    })

    it('should connect with the ports of the init response from the shared worker', async () => {
        adapter.connect()

        worker.receive(initResponse, [dataChannel.port1, controlChannel.port1])

        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)

        const received = nextMessage(dataChannel.port2)
        adapter.sendMessage({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })

        await expect(received).resolves.toStrictEqual({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })
    })

    it('should ignore unrelated messages from the shared worker', () => {
        adapter.connect()

        worker.receive({ type: 'progress' }, [dataChannel.port1, controlChannel.port1])

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should stop listening to the shared worker when destroyed', () => {
        adapter.connect()

        adapter.destroy()
        worker.receive(initResponse, [dataChannel.port1, controlChannel.port1])

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should log uncaught errors of the shared worker', () => {
        adapter.connect()

        worker.dispatchEvent(
            new ErrorEvent('error', {
                message: 'Uncaught Error: boom',
                filename: 'https://example.com/worker.js',
                lineno: 12,
                colno: 5,
            }),
        )

        expect(console.error).toHaveBeenCalledWith(
            '[SharedWorkerHostAdapter]',
            'Uncaught error in shared worker: Uncaught Error: boom (https://example.com/worker.js:12:5)',
        )
    })

    it('should explain that the channel cannot connect if the shared worker fails to start', () => {
        adapter.connect()

        worker.dispatchEvent(new Event('error'))

        expect(console.error).toHaveBeenCalledWith(
            '[SharedWorkerHostAdapter]',
            expect.stringContaining('The shared worker could not be started'),
        )
    })
})
