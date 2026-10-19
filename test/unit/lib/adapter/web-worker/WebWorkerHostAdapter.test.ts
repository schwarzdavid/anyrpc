import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    type HeartbeatOption,
    type SharedWorkerHostAdapterOptions,
    type SharedWorkerLike,
    WebWorkerHostAdapter,
    type WebWorkerLike,
} from '@/lib/adapter/web-worker'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import { nextMessage } from '../../../__helper/nextMessage'

interface TestMethods {
    foo(value: string): void
}

vi.mock(import('@/utils/uuid'), () => ({
    uuid: vi.fn<() => string>(() => 'init-id'),
}))

class FakeWorker extends EventTarget implements WebWorkerLike {
    postMessage = vi.fn<(message: unknown) => void>()
    terminate = vi.fn<() => void>()

    receive(data: unknown, ports: MessagePort[] = []) {
        this.dispatchEvent(new MessageEvent('message', { data, ports }))
    }
}

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

const initRequest = { jsonrpc: '2.0', id: 'init-id', method: 'anyrpc::web-worker-init', params: ['my-app'] }
const initResponse = { jsonrpc: '2.0', id: 'init-id', result: null }

describe(WebWorkerHostAdapter, () => {
    let dataChannel: MessageChannel
    let controlChannel: MessageChannel
    let adapter: WebWorkerHostAdapter<TestMethods, TestMethods>

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        dataChannel = new MessageChannel()
        controlChannel = new MessageChannel()
    })

    afterEach(() => {
        adapter.destroy()
        dataChannel.port2.close()
        controlChannel.port2.close()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    function initLogger<Adapter extends WebWorkerHostAdapter<TestMethods, TestMethods>>(created: Adapter): Adapter {
        created.initLogger(LogLevel.DEBUG)
        return created
    }

    describe('with a dedicated worker', () => {
        let worker: FakeWorker

        beforeEach(() => {
            worker = new FakeWorker()
            adapter = initLogger(new WebWorkerHostAdapter(worker, 'my-app'))
        })

        it('should send an init request with its name to the worker when connecting', () => {
            adapter.connect()

            expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith(initRequest)
        })

        it('should use the default name and repeat the init request in the configured interval', () => {
            vi.useFakeTimers()
            adapter = initLogger(new WebWorkerHostAdapter(worker, undefined, { pollingInterval: 100 }))

            adapter.connect()
            vi.advanceTimersByTime(300)

            expect(worker.postMessage).toHaveBeenCalledTimes(4)
            expect(worker.postMessage).toHaveBeenLastCalledWith(
                expect.objectContaining({ params: ['anyrpc-web-worker-adapter'] }),
            )
        })

        it('should connect with the ports of the init response from the worker', async () => {
            adapter.connect()

            worker.receive(initResponse, [dataChannel.port1, controlChannel.port1])

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)

            const received = nextMessage(dataChannel.port2)
            adapter.sendMessage({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })

            await expect(received).resolves.toStrictEqual({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })
        })

        it('should ignore unrelated messages of the worker', () => {
            adapter.connect()

            worker.receive({ type: 'progress' }, [dataChannel.port1, controlChannel.port1])

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should log uncaught errors of the worker and keep trying to connect', () => {
            vi.useFakeTimers()
            adapter.connect()

            worker.dispatchEvent(
                new ErrorEvent('error', {
                    message: 'Uncaught Error: boom',
                    filename: 'https://example.com/worker.js',
                    lineno: 12,
                    colno: 5,
                }),
            )
            vi.advanceTimersByTime(1000)

            expect(console.error).toHaveBeenCalledWith(
                '[WebWorkerHostAdapter]',
                'Uncaught error in web worker: Uncaught Error: boom (https://example.com/worker.js:12:5)',
            )
            expect(worker.postMessage).toHaveBeenCalledTimes(2)
        })

        it('should explain that a worker that fails to start never connects and stop polling', () => {
            vi.useFakeTimers()
            adapter.connect()

            worker.dispatchEvent(new Event('error'))
            vi.advanceTimersByTime(5000)

            expect(console.error).toHaveBeenCalledWith(
                '[WebWorkerHostAdapter]',
                expect.stringContaining('The web worker could not be started'),
            )
            expect(worker.postMessage).toHaveBeenCalledTimes(1)
        })

        it('should keep logging errors of the worker once connected, but only once per error', () => {
            adapter.connect()
            adapter.connect()
            worker.receive(initResponse, [dataChannel.port1, controlChannel.port1])

            worker.dispatchEvent(new ErrorEvent('error', { message: 'late' }))

            expect(console.error).toHaveBeenCalledTimes(1)
        })

        it('should stop logging errors of the worker when destroyed', () => {
            adapter.connect()

            adapter.destroy()
            worker.dispatchEvent(new ErrorEvent('error', { message: 'late' }))

            expect(console.error).not.toHaveBeenCalled()
        })

        it('should stop listening to the worker when destroyed', () => {
            adapter.connect()

            adapter.destroy()
            worker.receive(initResponse, [dataChannel.port1, controlChannel.port1])

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should not terminate the worker by default', () => {
            adapter.connect()

            adapter.destroy()

            expect(worker.terminate).not.toHaveBeenCalled()
        })

        it('should terminate the worker if terminateOnDestroy is set', () => {
            adapter = initLogger(new WebWorkerHostAdapter(worker, 'my-app', { terminateOnDestroy: true }))
            adapter.connect()

            adapter.destroy()

            expect(worker.terminate).toHaveBeenCalledTimes(1)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })
    })

    describe('with a shared worker', () => {
        let worker: FakeSharedWorker

        beforeEach(() => {
            worker = new FakeSharedWorker()
            adapter = initLogger(new WebWorkerHostAdapter(worker, 'my-app'))
        })

        it('should start the port and send the init request through it', () => {
            adapter.connect()

            expect(worker.fakePort.start).toHaveBeenCalledTimes(1)
            expect(worker.fakePort.postMessage).toHaveBeenCalledExactlyOnceWith(initRequest)
        })

        it('should connect with the ports of the init response from the shared worker', () => {
            adapter.connect()

            worker.receive(initResponse, [dataChannel.port1, controlChannel.port1])

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should explain that a shared worker that fails to start never connects and stop polling', () => {
            vi.useFakeTimers()
            adapter.connect()

            worker.dispatchEvent(new Event('error'))
            vi.advanceTimersByTime(5000)

            expect(console.error).toHaveBeenCalledWith(
                '[WebWorkerHostAdapter]',
                expect.stringContaining('The shared worker could not be started'),
            )
            expect(worker.fakePort.postMessage).toHaveBeenCalledTimes(1)
        })

        it('should stop listening to the shared worker when destroyed', () => {
            adapter.connect()

            adapter.destroy()
            worker.receive(initResponse, [dataChannel.port1, controlChannel.port1])

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should never try to terminate a shared worker', () => {
            const options = { terminateOnDestroy: true } as Partial<SharedWorkerHostAdapterOptions>
            adapter = initLogger(new WebWorkerHostAdapter(worker, 'my-app', options))
            adapter.connect()

            expect(() => adapter.destroy()).not.toThrowError()
        })
    })

    describe('heartbeat', () => {
        function connectWithHeartbeat(heartbeat?: HeartbeatOption) {
            vi.useFakeTimers()
            const worker = new FakeWorker()
            adapter = initLogger(
                new WebWorkerHostAdapter(worker, 'my-app', heartbeat === undefined ? {} : { heartbeat }),
            )
            adapter.connect()
            worker.receive(initResponse, [dataChannel.port1, controlChannel.port1])
        }

        it('should be disabled by default', () => {
            connectWithHeartbeat()

            vi.advanceTimersByTime(60_000)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should use the default interval and timeout when enabled with true', () => {
            connectWithHeartbeat(true)

            vi.advanceTimersByTime(14_999)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)

            vi.advanceTimersByTime(1)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should merge partial options with the defaults', () => {
            connectWithHeartbeat({ timeout: 100 })

            vi.advanceTimersByTime(5099)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)

            vi.advanceTimersByTime(1)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })
    })
})
