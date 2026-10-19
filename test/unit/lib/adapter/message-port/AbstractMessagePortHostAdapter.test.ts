import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AbstractMessagePortHostAdapter } from '@/lib/adapter/message-port/AbstractMessagePortHostAdapter'
import type { InitResponse } from '@/utils/message-port/handshake'
import type { HeartbeatOption } from '@/lib/Heartbeat'
import type { ConnectionHandler, ConnectionLostHandler } from '@/lib/adapter/AbstractRpcAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import { confirmHandshake } from '../../../__helper/confirmHandshake'
import { nextMessage } from '../../../__helper/nextMessage'

interface TestMethods {
    foo(value: string): void
}

const METHOD = 'anyrpc::test-init'

const ping = { jsonrpc: '2.0', method: 'anyrpc::ping', params: [] }
const pong = { jsonrpc: '2.0', method: 'anyrpc::pong', params: [] }

class TestHostAdapter extends AbstractMessagePortHostAdapter<TestMethods, TestMethods> {
    readonly listenForInitRequests = vi.fn<(signal: AbortSignal) => void>()
    readonly postInitResponse = vi.fn<(response: InitResponse, transfer: Transferable[]) => void>()

    constructor(name = 'my-app', heartbeat: HeartbeatOption = false) {
        super(METHOD, name, heartbeat)
        this.initLogger(LogLevel.DEBUG)
    }

    accept(data: unknown): boolean {
        return this.acceptInitRequest(data)
    }

    get transferredPorts(): [MessagePort, MessagePort] {
        const [, ports] = this.postInitResponse.mock.calls.at(-1)!
        return ports as [MessagePort, MessagePort]
    }

    get transferredControlPort(): MessagePort {
        return this.transferredPorts[1]
    }
}

function initRequest(id = 'init-id', name = 'my-app') {
    return { jsonrpc: '2.0', id, method: METHOD, params: [name] }
}

describe(AbstractMessagePortHostAdapter, () => {
    let adapter: TestHostAdapter

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        adapter = new TestHostAdapter()
    })

    afterEach(() => {
        adapter.destroy()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('connect', () => {
        it('should start listening for init requests with an abort signal', () => {
            adapter.connect()

            expect(adapter.listenForInitRequests).toHaveBeenCalledWith(expect.any(AbortSignal))
            expect(adapter.listenForInitRequests.mock.calls[0]![0].aborted).toBe(false)
        })

        it('should abort the previous listeners when connecting twice', () => {
            adapter.connect()
            const [previousSignal] = adapter.listenForInitRequests.mock.calls[0]!

            adapter.connect()

            expect(previousSignal.aborted).toBe(true)
            expect(adapter.listenForInitRequests.mock.calls[1]![0].aborted).toBe(false)
        })

        it('should answer init requests again after it was destroyed and reconnected', async () => {
            adapter.connect()
            adapter.accept(initRequest('first-id'))
            adapter.destroy()

            adapter.connect()
            const accepted = adapter.accept(initRequest('second-id'))
            await confirmHandshake(adapter.transferredControlPort)

            expect(accepted).toBe(true)
            expect(adapter.listenForInitRequests).toHaveBeenCalledTimes(2)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })
    })

    describe('init requests', () => {
        it('should answer an init request with a data and a control port', () => {
            const accepted = adapter.accept(initRequest())

            expect(accepted).toBe(true)
            expect(adapter.postInitResponse).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 'init-id', result: null }, [
                expect.any(MessagePort),
                expect.any(MessagePort),
            ])
        })

        it('should ping the transferred control port and stay disconnected until the remote side answers', async () => {
            adapter.accept(initRequest())
            const controlPort = adapter.transferredControlPort

            await expect(nextMessage(controlPort)).resolves.toStrictEqual(ping)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)

            await confirmHandshake(controlPort)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should communicate through the transferred ports', async () => {
            adapter.accept(initRequest())
            const [dataPort, controlPort] = adapter.transferredPorts
            await confirmHandshake(controlPort)

            const receivedData = nextMessage(dataPort)
            adapter.sendMessage({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })
            const receivedPong = nextMessage(controlPort)
            controlPort.postMessage(ping)

            await expect(receivedData).resolves.toStrictEqual({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })
            await expect(receivedPong).resolves.toStrictEqual(pong)
        })

        it.each([
            ['another name', initRequest('init-id', 'other-app')],
            ['another method', { ...initRequest(), method: 'anyrpc::other-init' }],
            ['an unrelated message', { type: 'progress', value: 42 }],
            ['a primitive', 'hello'],
        ])('should ignore %s', (_, data) => {
            const accepted = adapter.accept(data)

            expect(accepted).toBe(false)
            expect(adapter.postInitResponse).not.toHaveBeenCalled()
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should ignore an init request it has already answered and warn about it', () => {
            adapter.accept(initRequest())
            const connectionHandler = vi.fn<ConnectionHandler>()
            adapter.connectionHandler = connectionHandler

            const accepted = adapter.accept(initRequest())

            expect(accepted).toBe(false)
            expect(adapter.postInitResponse).toHaveBeenCalledTimes(1)
            expect(connectionHandler).not.toHaveBeenCalled()
            expect(console.warn).toHaveBeenCalledWith(
                '[TestHostAdapter]',
                expect.stringContaining('repeated handshake request'),
            )
        })

        it('should answer a new init request and replace the previous connection', async () => {
            adapter.accept(initRequest('first-id'))
            await confirmHandshake(adapter.transferredControlPort)
            const connectionLostHandler = vi.fn<ConnectionLostHandler>()
            adapter.connectionLostHandler = connectionLostHandler

            const accepted = adapter.accept(initRequest('second-id'))
            await confirmHandshake(adapter.transferredControlPort)

            expect(accepted).toBe(true)
            expect(adapter.postInitResponse).toHaveBeenLastCalledWith(
                { jsonrpc: '2.0', id: 'second-id', result: null },
                [expect.any(MessagePort), expect.any(MessagePort)],
            )
            expect(connectionLostHandler).toHaveBeenCalledTimes(1)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })
    })

    describe('heartbeat', () => {
        it('should be disabled by default', async () => {
            vi.useFakeTimers()
            adapter.accept(initRequest())
            await confirmHandshake(adapter.transferredControlPort)

            vi.advanceTimersByTime(60_000)

            expect(vi.getTimerCount()).toBe(0)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should keep pinging the transferred control port when enabled', async () => {
            adapter = new TestHostAdapter('my-app', { interval: 10, timeout: 50 })
            adapter.accept(initRequest())
            const controlPort = adapter.transferredControlPort
            await confirmHandshake(controlPort)
            const pings: unknown[] = []
            controlPort.addEventListener('message', (event) => pings.push(event.data))

            await vi.waitFor(() => expect(pings.length).toBeGreaterThan(1))

            expect(pings).toContainEqual(ping)
        })

        it('should disconnect when the remote side does not answer in time', async () => {
            vi.useFakeTimers()
            adapter = new TestHostAdapter('my-app', { interval: 100, timeout: 250 })
            adapter.accept(initRequest())
            await confirmHandshake(adapter.transferredControlPort)

            vi.advanceTimersByTime(350)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })
    })

    describe('destroy', () => {
        it('should stop listening and disconnect', async () => {
            adapter.connect()
            const [signal] = adapter.listenForInitRequests.mock.calls[0]!
            adapter.accept(initRequest())
            await confirmHandshake(adapter.transferredControlPort)

            adapter.destroy()

            expect(signal.aborted).toBe(true)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })
    })
})
