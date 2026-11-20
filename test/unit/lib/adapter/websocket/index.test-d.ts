import type { IncomingMessage } from 'node:http'
import { describe, expectTypeOf, it } from 'vitest'
import type { WebSocket as WsSocket, WebSocketServer } from 'ws'
import { createRpcHub } from '@/createRpcHub'
import type { RpcHub } from '@/types/RpcHub'
import {
    WebSocketClientAdapter,
    type WebSocketClientAdapterOptions,
    WebSocketHubAdapter,
    type WebSocketLike,
    type WebSocketPeerContext,
    type WebSocketRequestLike,
    type WebSocketServerLike,
} from '@/lib/adapter/websocket'
import type { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import type { AbstractRpcHubAdapter } from '@/lib/adapter/AbstractRpcHubAdapter'
import type { HeartbeatOption } from '@/lib/Heartbeat'

interface Methods {
    ping(): string
}

describe('@schwarzdavid/anyrpc/adapters/websocket entry point', () => {
    it('should accept ws servers and sockets', () => {
        expectTypeOf<WebSocketServer>().toExtend<WebSocketServerLike>()
        expectTypeOf<WsSocket>().toExtend<WebSocketLike>()
        expectTypeOf<WebSocket>().toExtend<WebSocketLike>()
    })

    it('should accept ws servers with their request type', () => {
        expectTypeOf<WebSocketServer>().toExtend<WebSocketServerLike<IncomingMessage>>()
        expectTypeOf<IncomingMessage>().toExtend<WebSocketRequestLike>()
    })

    it('should reject servers whose connection listener cannot take the request', () => {
        interface SocketOnlyServer {
            on(event: 'connection', listener: (socket: WebSocketLike) => void): unknown
            off(event: 'connection', listener: (socket: WebSocketLike) => void): unknown
        }

        expectTypeOf<SocketOnlyServer>().not.toExtend<WebSocketServerLike>()
    })

    it('should give the peers of a hub the upgrade request', () => {
        const server = {} as WebSocketServer

        expectTypeOf(createRpcHub(new WebSocketHubAdapter<Methods, Methods>(server))).toEqualTypeOf<
            RpcHub<Methods, Methods, WebSocketPeerContext>
        >()
        expectTypeOf(createRpcHub(new WebSocketHubAdapter<Methods, Methods, IncomingMessage>(server))).toEqualTypeOf<
            RpcHub<Methods, Methods, WebSocketPeerContext<IncomingMessage>>
        >()
        expectTypeOf(
            createRpcHub<Methods, Methods, WebSocketPeerContext<IncomingMessage>>(new WebSocketHubAdapter(server)),
        ).toEqualTypeOf<RpcHub<Methods, Methods, WebSocketPeerContext<IncomingMessage>>>()
    })

    it('should leave the context unknown when a WebSocket hub is created with two type arguments', () => {
        expectTypeOf(createRpcHub<Methods, Methods>(new WebSocketHubAdapter({} as WebSocketServer))).toEqualTypeOf<
            RpcHub<Methods, Methods, unknown>
        >()
    })

    it('should create a client channel adapter and a hub adapter', () => {
        expectTypeOf<WebSocketClientAdapter<Methods, Methods>>().toExtend<AbstractRpcAdapter<Methods, Methods>>()
        expectTypeOf<WebSocketHubAdapter<Methods, Methods>>().toExtend<
            AbstractRpcHubAdapter<Methods, Methods, WebSocketPeerContext>
        >()
    })

    it('should expose the client options', () => {
        expectTypeOf<WebSocketClientAdapterOptions>().toEqualTypeOf<{
            reconnect: boolean
            heartbeat: HeartbeatOption
        }>()
    })
})
