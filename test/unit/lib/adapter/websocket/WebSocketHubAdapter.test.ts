import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { WebSocketHubAdapter } from '@/lib/adapter/websocket/WebSocketHubAdapter'
import { WebSocketPeerAdapter, type WebSocketLike } from '@/lib/adapter/websocket/WebSocketPeerAdapter'
import type { PeerHandler, PeerLostHandler } from '@/lib/adapter/AbstractRpcHubAdapter'
import { ControlMethod, createControlMessage } from '@/utils/controlMessages'
import { FakeSocket } from '../../../__helper/FakeSocket'

interface TestMethods {
    foo(value: string): void
}

class FakeServer extends EventEmitter {
    accept(socket: WebSocketLike): void {
        this.emit('connection', socket)
    }
}

describe(WebSocketHubAdapter, () => {
    let server: FakeServer
    let hubAdapter: WebSocketHubAdapter<TestMethods, TestMethods>
    let peerHandler: Mock<PeerHandler<TestMethods, TestMethods>>
    let peerLostHandler: Mock<PeerLostHandler>

    beforeEach(() => {
        vi.useFakeTimers()
        server = new FakeServer()
        hubAdapter = new WebSocketHubAdapter(server)
        peerHandler = vi.fn<PeerHandler<TestMethods, TestMethods>>(({ adapter }) => void adapter.connect())
        peerLostHandler = vi.fn<PeerLostHandler>()
        hubAdapter.peerHandler = peerHandler
        hubAdapter.peerLostHandler = peerLostHandler
    })

    afterEach(() => {
        hubAdapter.destroy()
        vi.useRealTimers()
    })

    it('should add every new connection as a peer', () => {
        hubAdapter.connect()

        server.accept(new FakeSocket())

        expect(peerHandler).toHaveBeenCalledWith({ id: expect.any(String), adapter: expect.any(WebSocketPeerAdapter) })
    })

    it('should remove a peer once its socket closes', () => {
        const socket = new FakeSocket()
        hubAdapter.connect()
        server.accept(socket)
        const id = peerHandler.mock.calls[0]?.[0].id

        socket.closeFromRemote()

        expect(peerLostHandler).toHaveBeenCalledWith(id)
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
        hubAdapter.peerHandler = peerHandler
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
