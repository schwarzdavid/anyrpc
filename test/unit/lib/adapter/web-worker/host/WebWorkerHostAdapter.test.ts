import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type HeartbeatOption, WebWorkerHostAdapter, type WebWorkerLike } from '@/lib/adapter/web-worker/host'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import { confirmHandshake } from '../../../../__helper/confirmHandshake'

interface TestMethods {
    foo(value: string): void
}

class FakeWorker extends EventTarget implements WebWorkerLike {
    postMessage = vi.fn<(message: unknown, transfer: Transferable[]) => void>()
    terminate = vi.fn<() => void>()

    receive(data: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data }))
    }
}

function initRequest(name = 'anyrpc-web-worker-adapter', id = 'init-id') {
    return { jsonrpc: '2.0', id, method: 'anyrpc::web-worker-init', params: [name] }
}

describe(WebWorkerHostAdapter, () => {
    let worker: FakeWorker
    let adapter: WebWorkerHostAdapter<TestMethods, TestMethods>

    function confirmFromWorker(call = 0): Promise<void> {
        const [, [, controlPort]] = worker.postMessage.mock.calls[call]! as [unknown, [MessagePort, MessagePort]]
        return confirmHandshake(controlPort)
    }

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        worker = new FakeWorker()
        adapter = new WebWorkerHostAdapter(worker)
        adapter.initLogger(LogLevel.DEBUG)
    })

    afterEach(() => {
        adapter.destroy()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('handshake', () => {
        it('should answer init requests of the worker with a data and a control port', async () => {
            adapter.connect()

            worker.receive(initRequest())
            await confirmFromWorker()

            expect(worker.postMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 'init-id', result: null }, [
                expect.any(MessagePort),
                expect.any(MessagePort),
            ])
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should only answer init requests with a matching name', () => {
            adapter = new WebWorkerHostAdapter(worker, 'my-app')
            adapter.connect()

            worker.receive(initRequest('other-app'))

            expect(worker.postMessage).not.toHaveBeenCalled()

            worker.receive(initRequest('my-app'))

            expect(worker.postMessage).toHaveBeenCalledTimes(1)
        })

        it('should ignore unrelated messages of the worker', () => {
            adapter.connect()

            worker.receive({ type: 'progress', value: 42 })
            worker.receive('hello')

            expect(worker.postMessage).not.toHaveBeenCalled()
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should not listen twice when connecting twice', () => {
            adapter.connect()
            adapter.connect()

            worker.receive(initRequest())

            expect(worker.postMessage).toHaveBeenCalledTimes(1)
        })
    })

    describe('worker errors', () => {
        it('should log uncaught errors of the worker', () => {
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
                '[WebWorkerHostAdapter]',
                'Uncaught error in web worker: Uncaught Error: boom (https://example.com/worker.js:12:5)',
            )
        })

        it('should explain that the channel cannot connect if the worker fails to start', () => {
            adapter.connect()

            worker.dispatchEvent(new Event('error'))

            expect(console.error).toHaveBeenCalledWith(
                '[WebWorkerHostAdapter]',
                expect.stringContaining('The web worker could not be started'),
            )
        })
    })

    describe('heartbeat', () => {
        async function connectWithHeartbeat(heartbeat: HeartbeatOption) {
            vi.useFakeTimers()
            adapter = new WebWorkerHostAdapter(worker, undefined, { heartbeat })
            adapter.connect()
            worker.receive(initRequest())
            await confirmFromWorker()
        }

        it('should be disabled by default', async () => {
            vi.useFakeTimers()
            adapter.connect()
            worker.receive(initRequest())
            await confirmFromWorker()

            vi.advanceTimersByTime(60_000)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should use the default interval and timeout when enabled with true', async () => {
            await connectWithHeartbeat(true)

            vi.advanceTimersByTime(14_999)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)

            vi.advanceTimersByTime(1)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should merge partial options with the defaults', async () => {
            await connectWithHeartbeat({ timeout: 100 })

            vi.advanceTimersByTime(5099)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)

            vi.advanceTimersByTime(1)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })
    })

    describe('destroy', () => {
        it('should stop answering init requests', () => {
            adapter.connect()

            adapter.destroy()
            worker.receive(initRequest())

            expect(worker.postMessage).not.toHaveBeenCalled()
        })

        it('should not terminate the worker by default', () => {
            adapter.connect()

            adapter.destroy()

            expect(worker.terminate).not.toHaveBeenCalled()
        })

        it('should terminate the worker if terminateOnDestroy is set', () => {
            adapter = new WebWorkerHostAdapter(worker, undefined, { terminateOnDestroy: true })
            adapter.connect()

            adapter.destroy()

            expect(worker.terminate).toHaveBeenCalledTimes(1)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })
    })
})
