import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { WebSocketPeerAdapter } from '@/lib/adapter/websocket/WebSocketPeerAdapter'
import type { ConnectionLostHandler, MessageHandler } from '@/lib/adapter/AbstractRpcAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { RpcRequest } from '@/types/RpcMessages'
import { ControlMethod, createControlMessage } from '@/utils/controlMessages'
import { FakeSocket } from '../../../__helper/FakeSocket'
import { bindAdapter } from '../../../__helper/bindAdapter'

interface TestMethods {
    foo(value: string): void
}

const request: RpcRequest<TestMethods> = { jsonrpc: '2.0', id: 'request-id', method: 'foo', params: ['bar'] }

describe(WebSocketPeerAdapter, () => {
    let socket: FakeSocket
    let adapter: WebSocketPeerAdapter<TestMethods, TestMethods>
    let messageHandler: Mock<MessageHandler>
    let connectionLostHandler: Mock<ConnectionLostHandler>

    function createAdapter(heartbeat?: { interval: number; timeout: number }) {
        adapter = new WebSocketPeerAdapter<TestMethods, TestMethods>(socket, heartbeat)
        messageHandler = vi.fn<MessageHandler>()
        connectionLostHandler = vi.fn<ConnectionLostHandler>()
        bindAdapter(adapter, { onMessage: messageHandler })
        bindAdapter(adapter, { onConnectionLost: connectionLostHandler })
        bindAdapter(adapter, { logLevel: LogLevel.DEBUG })
    }

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        socket = new FakeSocket()
        createAdapter()
    })

    afterEach(() => {
        adapter.destroy()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('should be connected right after connecting to an open socket', () => {
        adapter.connect()

        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
    })

    it('should send messages as JSON while the socket is open', () => {
        adapter.connect()

        adapter.sendMessage(request)
        socket.readyState = 2
        adapter.sendMessage(request)

        expect(socket.sent()).toStrictEqual([request])
    })

    it('should forward text messages', () => {
        adapter.connect()

        socket.receive(JSON.stringify(request))

        expect(messageHandler).toHaveBeenCalledWith(request)
    })

    it('should drop binary messages with a warning', () => {
        adapter.connect()

        socket.receive(new Uint8Array([1, 2]))

        expect(messageHandler).not.toHaveBeenCalled()
        expect(console.warn).toHaveBeenCalledWith(
            '[WebSocketPeerAdapter]',
            'Ignored a binary message: the WebSocket adapter only supports text messages',
        )
    })

    it('should destroy itself when the socket closes', () => {
        adapter.connect()

        socket.closeFromRemote()

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DESTROYED)
        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(socket.close).not.toHaveBeenCalled()
    })

    it('should ignore messages after the socket closed', () => {
        adapter.connect()
        socket.closeFromRemote()

        socket.receive(JSON.stringify(request))

        expect(messageHandler).not.toHaveBeenCalled()
    })

    it('should say goodbye and close the socket when destroyed', () => {
        adapter.connect()

        adapter.destroy()

        expect(socket.sent()).toStrictEqual([createControlMessage(ControlMethod.GOODBYE)])
        expect(socket.close).toHaveBeenCalledWith(1000)
        expect(adapter.connectionStatus).toBe(ConnectionStatus.DESTROYED)
    })

    it('should warn about socket errors and stay connected until the socket closes', () => {
        adapter.connect()

        socket.fail()

        expect(console.warn).toHaveBeenCalledWith(
            '[WebSocketPeerAdapter]',
            'The WebSocket connection reported an error',
        )
        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        expect(socket.close).not.toHaveBeenCalled()
    })

    it('should close the socket when the remote says goodbye', () => {
        adapter.connect()

        socket.receive(JSON.stringify(createControlMessage(ControlMethod.GOODBYE)))

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DESTROYED)
        expect(socket.close).toHaveBeenCalledWith(1000)
    })

    it('should destroy itself when the client stops answering the heartbeat', () => {
        vi.useFakeTimers()
        createAdapter({ interval: 1000, timeout: 3000 })
        adapter.connect()

        vi.advanceTimersByTime(4000)

        expect(socket.close).toHaveBeenCalledWith(1000)
        expect(adapter.connectionStatus).toBe(ConnectionStatus.DESTROYED)
    })
})
