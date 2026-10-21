import { describe, expectTypeOf, it } from 'vitest'
import type { WebSocket as WsSocket, WebSocketServer } from 'ws'
import {
    WebSocketClientAdapter,
    type WebSocketClientAdapterOptions,
    WebSocketHubAdapter,
    type WebSocketLike,
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

    it('should create a client channel adapter and a hub adapter', () => {
        expectTypeOf<WebSocketClientAdapter<Methods, Methods>>().toExtend<AbstractRpcAdapter<Methods, Methods>>()
        expectTypeOf<WebSocketHubAdapter<Methods, Methods>>().toExtend<AbstractRpcHubAdapter<Methods, Methods>>()
    })

    it('should expose the client options', () => {
        expectTypeOf<WebSocketClientAdapterOptions>().toEqualTypeOf<{
            reconnect: boolean
            heartbeat: HeartbeatOption
        }>()
    })
})
