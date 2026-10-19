import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AbstractMessagePortClientAdapter } from '@/lib/adapter/message-port/AbstractMessagePortClientAdapter'
import type { InitRequest } from '@/utils/message-port/handshake'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import { nextMessage } from '../../../__helper/nextMessage'

interface TestMethods {
    foo(value: string): void
}

const METHOD = 'anyrpc::test-init'

class TestClientAdapter extends AbstractMessagePortClientAdapter<TestMethods, TestMethods> {
    readonly listenForInitResponses = vi.fn<(signal: AbortSignal) => void>()
    readonly postInitRequest = vi.fn<(request: InitRequest) => void>()

    constructor(name = 'my-app', pollingInterval = 1000) {
        super(METHOD, name, pollingInterval)
        this.initLogger(LogLevel.DEBUG)
    }

    accept(event: MessageEvent): void {
        this.acceptInitResponse(event)
    }

    get postedRequest(): InitRequest {
        return this.postInitRequest.mock.calls[0]![0]
    }

    get listenerSignal(): AbortSignal {
        return this.listenForInitResponses.mock.calls[0]![0]
    }
}

function responseTo(request: Pick<InitRequest, 'id'>, ports: MessagePort[]): MessageEvent {
    return new MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result: null }, ports })
}

describe(AbstractMessagePortClientAdapter, () => {
    let dataChannel: MessageChannel
    let controlChannel: MessageChannel
    let adapter: TestClientAdapter

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        dataChannel = new MessageChannel()
        controlChannel = new MessageChannel()
        adapter = new TestClientAdapter()
    })

    afterEach(() => {
        adapter.destroy()
        dataChannel.port2.close()
        controlChannel.port2.close()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('connect', () => {
        it('should post an init request with the method and name immediately', () => {
            adapter.connect()

            expect(adapter.postInitRequest).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: expect.any(String),
                method: METHOD,
                params: ['my-app'],
            })
        })

        it('should listen for init responses with an abort signal', () => {
            adapter.connect()

            expect(adapter.listenForInitResponses).toHaveBeenCalledWith(expect.any(AbortSignal))
            expect(adapter.listenerSignal.aborted).toBe(false)
        })

        it('should repeat the same init request once per polling interval', () => {
            adapter.connect()
            vi.advanceTimersByTime(3000)

            expect(adapter.postInitRequest).toHaveBeenCalledTimes(4)
            expect(new Set(adapter.postInitRequest.mock.calls.map(([request]) => request.id)).size).toBe(1)
        })

        it('should use the configured polling interval', () => {
            adapter = new TestClientAdapter('my-app', 100)

            adapter.connect()
            vi.advanceTimersByTime(300)

            expect(adapter.postInitRequest).toHaveBeenCalledTimes(4)
        })

        it('should abort the previous handshake when connecting twice', () => {
            adapter.connect()
            const previousSignal = adapter.listenerSignal

            adapter.connect()
            vi.advanceTimersByTime(1000)

            expect(previousSignal.aborted).toBe(true)
            expect(adapter.postInitRequest).toHaveBeenCalledTimes(3)
        })
    })

    describe('init responses', () => {
        it('should attach the received ports and stop the handshake', () => {
            adapter.connect()

            adapter.accept(responseTo(adapter.postedRequest, [dataChannel.port1, controlChannel.port1]))
            vi.advanceTimersByTime(3000)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
            expect(adapter.listenerSignal.aborted).toBe(true)
            expect(adapter.postInitRequest).toHaveBeenCalledTimes(1)
        })

        it('should communicate through the received ports', async () => {
            adapter.connect()
            adapter.accept(responseTo(adapter.postedRequest, [dataChannel.port1, controlChannel.port1]))

            const received = nextMessage(dataChannel.port2)
            adapter.sendMessage({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })

            await expect(received).resolves.toStrictEqual({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })
        })

        it('should ignore another response once the handshake is finished', async () => {
            const otherDataChannel = new MessageChannel()
            adapter.connect()
            adapter.accept(responseTo(adapter.postedRequest, [dataChannel.port1, controlChannel.port1]))
            adapter.accept(responseTo(adapter.postedRequest, [otherDataChannel.port1, new MessageChannel().port1]))

            const received = nextMessage(dataChannel.port2)
            adapter.sendMessage({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })

            await expect(received).resolves.toStrictEqual({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should ignore responses to other requests', () => {
            adapter.connect()

            adapter.accept(responseTo({ id: 'other-id' }, [dataChannel.port1, controlChannel.port1]))

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should ignore responses before connecting', () => {
            adapter.accept(responseTo({ id: 'any-id' }, [dataChannel.port1, controlChannel.port1]))

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should warn about and ignore responses without both ports', () => {
            adapter.connect()

            adapter.accept(responseTo(adapter.postedRequest, [dataChannel.port1]))
            vi.advanceTimersByTime(1000)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(adapter.postInitRequest).toHaveBeenCalledTimes(2)
            expect(console.warn).toHaveBeenCalledWith(
                '[TestClientAdapter]',
                'Ignored a handshake response without the expected message ports',
            )
        })
    })

    describe('reconnect', () => {
        it('should start a new handshake with a new id after the remote side said goodbye', async () => {
            adapter.connect()
            const previousRequest = adapter.postedRequest
            adapter.accept(responseTo(previousRequest, [dataChannel.port1, controlChannel.port1]))
            adapter.postInitRequest.mockClear()

            controlChannel.port2.postMessage({ jsonrpc: '2.0', method: 'anyrpc::goodbye', params: [] })

            await vi.waitFor(() => expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED))

            expect(adapter.postInitRequest).toHaveBeenCalledWith(expect.objectContaining({ method: METHOD }))
            expect(adapter.postedRequest.id).not.toBe(previousRequest.id)
        })

        it('should connect again after it was destroyed', () => {
            adapter.connect()
            adapter.accept(responseTo(adapter.postedRequest, [dataChannel.port1, controlChannel.port1]))
            adapter.destroy()

            adapter.connect()
            const [request] = adapter.postInitRequest.mock.calls[1]!
            adapter.accept(responseTo(request, [new MessageChannel().port1, new MessageChannel().port1]))

            expect(adapter.listenForInitResponses).toHaveBeenCalledTimes(2)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })
    })

    describe('destroy', () => {
        it('should stop the handshake', () => {
            adapter.connect()
            const request = adapter.postedRequest
            const signal = adapter.listenerSignal

            adapter.destroy()
            vi.advanceTimersByTime(3000)
            adapter.accept(responseTo(request, [dataChannel.port1, controlChannel.port1]))

            expect(adapter.postInitRequest).toHaveBeenCalledTimes(1)
            expect(signal.aborted).toBe(true)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })
    })
})
