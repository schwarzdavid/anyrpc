import { WebSocketServer } from 'ws'
import { createRpcHub } from 'anyrpc'
import { WebSocketHubAdapter } from 'anyrpc/adapters/websocket'
import type { ClientToServer, ServerToClient } from './WebSocketMessages'

const server = new WebSocketServer({ port: 8081 })
const hub = createRpcHub<ServerToClient, ClientToServer>(new WebSocketHubAdapter(server))

hub.$.handle('sendChat', (_context, text) => {
    hub.chatMessage.notify(text)
})

console.log('WebSocket chat server listening on ws://localhost:8081')
