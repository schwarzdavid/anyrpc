import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { WebSocketHubAdapter, type WebSocketPeerContext } from '@/lib/adapter/websocket/WebSocketHubAdapter'
import { WebSocketPeerAdapter, type WebSocketLike } from '@/lib/adapter/websocket/WebSocketPeerAdapter'
import type { PeerHandler } from '@/lib/adapter/AbstractRpcHubAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { ControlMethod, createControlMessage } from '@/utils/controlMessages'
import { FakeSocket } from '../../../__helper/FakeSocket'
import { bindHubAdapter } from '../../../__helper/bindAdapter'

interface TestMethods {
    foo(value: string): void
}

class FakeServer extends EventEmitter {
    accept(socket: WebSocketLike, request?: object): void {
        this.emit('connection', socket, request)
    }
}

describe(WebSocketHubAdapter, () => {
    let server: FakeServer
    let hubAdapter: WebSocketHubAdapter<TestMethods, TestMethods>
    let peerHandler: Mock<PeerHandler<TestMethods, TestMethods, WebSocketPeerContext>>

    beforeEach(() => {
        vi.useFakeTimers()
        server = new FakeServer()
        hubAdapter = new WebSocketHubAdapter(server)
        peerHandler = vi.fn<PeerHandler<TestMethods, TestMethods, WebSocketPeerContext>>(
            ({ adapter }) => void adapter.connect(),
        )
        bindHubAdapter(hubAdapter, { onPeer: peerHandler })
    })

    afterEach(() => {
        hubAdapter.destroy()
        vi.useRealTimers()
    })

    it('should add every new connection as a peer', () => {
        hubAdapter.connect()

        server.accept(new FakeSocket())

        expect(peerHandler).toHaveBeenCalledWith({
            id: expect.any(String),
            adapter: expect.any(WebSocketPeerAdapter),
            context: { request: undefined },
        })
    })

    it('should pass the upgrade request as context of the peer', () => {
        const request = { headers: { authorization: 'Bearer token' }, url: '/rpc?room=1' }
        hubAdapter.connect()

        server.accept(new FakeSocket(), request)

        expect(peerHandler.mock.calls[0]?.[0].context).toStrictEqual({ request })
        expect(peerHandler.mock.calls[0]?.[0].context.request).toBe(request)
    })

    it('should add the peer with an undefined request when the server emits none', () => {
        hubAdapter.connect()

        server.accept(new FakeSocket())

        expect(peerHandler).toHaveBeenCalledTimes(1)
        expect(peerHandler.mock.calls[0]?.[0].context).toStrictEqual({ request: undefined })
    })

    it('should destroy the adapter of a peer once its socket closes', () => {
        const socket = new FakeSocket()
        hubAdapter.connect()
        server.accept(socket)
        const peer = peerHandler.mock.calls[0]?.[0].adapter

        socket.closeFromRemote()

        expect(peer?.connectionStatus).toBe(ConnectionStatus.DESTROYED)
    })

    it('should ping peers by default', () => {
        const socket = new FakeSocket()
        hubAdapter.connect()
        server.accept(socket)

        vi.advanceTimersByTime(5000)

        expect(socket.send).toHaveBeenCalledWith(JSON.stringify(createControlMessage(ControlMethod.PING)))
    })

    it('should not ping peers when the heartbeat is disabled', () => {
        hubAdapter = new WebSocketHubAdapter(server, { heartbeat: false })
        bindHubAdapter(hubAdapter, { onPeer: peerHandler })
        const socket = new FakeSocket()
        hubAdapter.connect()
        server.accept(socket)

        vi.advanceTimersByTime(60000)

        expect(socket.send).not.toHaveBeenCalled()
    })

    it('should listen for connections only once when connecting twice', () => {
        hubAdapter.connect()
        hubAdapter.connect()

        expect(server.listenerCount('connection')).toBe(1)
    })

    it('should stop accepting connections when destroyed', () => {
        hubAdapter.connect()

        hubAdapter.destroy()
        server.accept(new FakeSocket())

        expect(server.listenerCount('connection')).toBe(0)
        expect(peerHandler).not.toHaveBeenCalled()
    })
})
