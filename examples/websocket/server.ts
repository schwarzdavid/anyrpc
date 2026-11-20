import type { IncomingMessage } from 'node:http'
import { WebSocketServer } from 'ws'
import { createRpcHub } from '@schwarzdavid/anyrpc'
import { WebSocketHubAdapter } from '@schwarzdavid/anyrpc/adapters/websocket'
import type { ClientToServer, ServerToClient } from './WebSocketMessages'

const server = new WebSocketServer({ port: 8081 })
const hub = createRpcHub(new WebSocketHubAdapter<ServerToClient, ClientToServer, IncomingMessage>(server))

hub.$.on('rpc.peer.connected', (peer) => {
    console.log(`Client connected from ${String(peer.context.request.socket.remoteAddress)}`)
})

hub.$.handle('sendChat', (_context, text) => {
    hub.chatMessage.notify(text)
})

console.log('WebSocket chat server listening on ws://localhost:8081')
