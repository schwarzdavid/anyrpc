import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { WebSocketClientAdapter } from '@/lib/adapter/websocket/WebSocketClientAdapter'
import type { ConnectionLostHandler, MessageHandler } from '@/lib/adapter/AbstractRpcAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { RpcRequest } from '@/types/RpcMessages'
import { ControlMethod, createControlMessage } from '@/utils/controlMessages'

interface TestMethods {
    foo(value: string): void
}

class FakeWebSocket extends EventTarget {
    static readonly instances: FakeWebSocket[] = []
    readyState = 0
    readonly send = vi.fn<(data: string) => void>()
    readonly close = vi.fn<(code?: number) => void>()

    constructor(readonly url: string | URL) {
        super()
        FakeWebSocket.instances.push(this)
    }

    static latest(): FakeWebSocket {
        const socket = FakeWebSocket.instances.at(-1)
        if (!socket) {
            throw new Error('No socket was created')
        }
        return socket
    }

    open(): void {
        this.readyState = 1
        this.dispatchEvent(new Event('open'))
    }

    receive(data: unknown): void {
        this.dispatchEvent(new MessageEvent('message', { data }))
    }

    closeFromRemote(code = 1006): void {
        this.readyState = 3
        this.dispatchEvent(new CloseEvent('close', { code }))
    }

    sent(): unknown[] {
        return this.send.mock.calls.map(([data]) => JSON.parse(data) as unknown)
    }
}

const request: RpcRequest<TestMethods> = { jsonrpc: '2.0', id: 'request-id', method: 'foo', params: ['bar'] }

describe(WebSocketClientAdapter, () => {
    let adapter: WebSocketClientAdapter<TestMethods, TestMethods>
    let messageHandler: Mock<MessageHandler>
    let connectionLostHandler: Mock<ConnectionLostHandler>

    function createAdapter(...args: ConstructorParameters<typeof WebSocketClientAdapter>) {
        adapter = new WebSocketClientAdapter<TestMethods, TestMethods>(...args)
        messageHandler = vi.fn<MessageHandler>()
        connectionLostHandler = vi.fn<ConnectionLostHandler>()
        adapter.messageHandler = messageHandler
        adapter.connectionLostHandler = connectionLostHandler
        adapter.initLogger(LogLevel.DEBUG)
        return adapter
    }

    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal('WebSocket', FakeWebSocket)
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        FakeWebSocket.instances.length = 0
        createAdapter('ws://localhost:8080')
    })

    afterEach(() => {
        adapter.destroy()
        vi.unstubAllGlobals()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('connect', () => {
        it('should open a socket to the url and connect once it is open', () => {
            adapter.connect()

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)

            FakeWebSocket.latest().open()

            expect(FakeWebSocket.latest().url).toBe('ws://localhost:8080')
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should replace an existing socket when connecting twice', () => {
            adapter.connect()
            const first = FakeWebSocket.latest()
            first.open()

            adapter.connect()
            first.receive(JSON.stringify(request))

            expect(first.close).toHaveBeenCalledWith(1000)
            expect(connectionLostHandler).toHaveBeenCalledTimes(1)
            expect(FakeWebSocket.instances).toHaveLength(2)
            expect(messageHandler).not.toHaveBeenCalled()
        })
    })

    describe('messages', () => {
        beforeEach(() => {
            adapter.connect()
            FakeWebSocket.latest().open()
        })

        it('should send messages as JSON', () => {
            adapter.sendMessage(request)

            expect(FakeWebSocket.latest().sent()).toStrictEqual([request])
        })

        it('should not send while the socket is not open', () => {
            FakeWebSocket.latest().readyState = 2

            adapter.sendMessage(request)

            expect(FakeWebSocket.latest().send).not.toHaveBeenCalled()
        })

        it('should forward text messages', () => {
            FakeWebSocket.latest().receive(JSON.stringify(request))

            expect(messageHandler).toHaveBeenCalledWith(request)
        })

        it('should drop binary messages with a warning', () => {
            FakeWebSocket.latest().receive(new ArrayBuffer(8))

            expect(messageHandler).not.toHaveBeenCalled()
            expect(console.warn).toHaveBeenCalledWith(
                '[WebSocketClientAdapter]',
                'Ignored a binary message: the WebSocket adapter only supports text messages',
            )
        })

        it('should answer pings even without heartbeat', () => {
            FakeWebSocket.latest().receive(JSON.stringify(createControlMessage(ControlMethod.PING)))

            expect(FakeWebSocket.latest().sent()).toStrictEqual([createControlMessage(ControlMethod.PONG)])
        })

        it('should not ping without heartbeat', () => {
            vi.advanceTimersByTime(60000)

            expect(FakeWebSocket.latest().send).not.toHaveBeenCalled()
        })
    })

    describe('reconnect', () => {
        it('should close the connection and reconnect with backoff when the socket closes', () => {
            adapter.connect()
            FakeWebSocket.latest().open()

            FakeWebSocket.latest().closeFromRemote()

            expect(connectionLostHandler).toHaveBeenCalledTimes(1)

            vi.advanceTimersByTime(999)

            expect(FakeWebSocket.instances).toHaveLength(1)

            vi.advanceTimersByTime(1)

            expect(FakeWebSocket.instances).toHaveLength(2)

            FakeWebSocket.latest().closeFromRemote()
            vi.advanceTimersByTime(2000)

            expect(FakeWebSocket.instances).toHaveLength(3)

            expect(console.log).toHaveBeenCalledWith(
                '[WebSocketClientAdapter]',
                'Reconnecting to ws://localhost:8080 in 2000 ms',
            )
        })

        it('should reset the backoff once a connection was opened', () => {
            adapter.connect()
            FakeWebSocket.latest().closeFromRemote()
            vi.advanceTimersByTime(1000)
            FakeWebSocket.latest().closeFromRemote()
            vi.advanceTimersByTime(2000)

            FakeWebSocket.latest().open()
            FakeWebSocket.latest().closeFromRemote()
            vi.advanceTimersByTime(1000)

            expect(FakeWebSocket.instances).toHaveLength(4)
        })

        it('should not reconnect when reconnect is disabled', () => {
            createAdapter('ws://localhost:8080', { reconnect: false })
            adapter.connect()
            FakeWebSocket.latest().open()

            FakeWebSocket.latest().closeFromRemote()
            vi.advanceTimersByTime(60000)

            expect(FakeWebSocket.instances).toHaveLength(1)
        })

        it('should close the connection when the server says goodbye', () => {
            adapter.connect()
            FakeWebSocket.latest().open()

            FakeWebSocket.latest().receive(JSON.stringify(createControlMessage(ControlMethod.GOODBYE)))

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        })
    })

    describe('heartbeat', () => {
        beforeEach(() => {
            createAdapter(new URL('ws://localhost:8080'), { heartbeat: { interval: 1000, timeout: 3000 } })
            adapter.connect()
            FakeWebSocket.latest().open()
        })

        it('should ping the server once per interval', () => {
            vi.advanceTimersByTime(1000)

            expect(FakeWebSocket.latest().sent()).toStrictEqual([createControlMessage(ControlMethod.PING)])
        })

        it('should drop the socket and reconnect when the server stops answering', () => {
            const socket = FakeWebSocket.latest()

            vi.advanceTimersByTime(4000)

            expect(socket.close).toHaveBeenCalledWith(1000)
            expect(connectionLostHandler).toHaveBeenCalledTimes(1)

            vi.advanceTimersByTime(1000)

            expect(FakeWebSocket.instances).toHaveLength(2)
        })
    })

    describe('destroy', () => {
        it('should say goodbye, close the socket and not reconnect', () => {
            adapter.connect()
            const socket = FakeWebSocket.latest()
            socket.open()

            adapter.destroy()
            vi.advanceTimersByTime(60000)

            expect(socket.sent()).toStrictEqual([createControlMessage(ControlMethod.GOODBYE)])
            expect(socket.close).toHaveBeenCalledWith(1000)
            expect(FakeWebSocket.instances).toHaveLength(1)
        })

        it('should cancel a scheduled reconnect', () => {
            adapter.connect()
            FakeWebSocket.latest().closeFromRemote()

            adapter.destroy()
            vi.advanceTimersByTime(60000)

            expect(FakeWebSocket.instances).toHaveLength(1)
        })
    })
})
