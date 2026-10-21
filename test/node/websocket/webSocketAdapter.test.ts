import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { createRpcHub } from '@/createRpcHub'
import { WebSocketClientAdapter, WebSocketHubAdapter } from '@/lib/adapter/websocket'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import type { RpcHub } from '@/types/RpcHub'

interface ClientToServer {
    add(a: number, b: number): number
}

interface ServerToClient {
    whoAreYou(): string
}

describe('webSocket adapters', () => {
    let server: WebSocketServer
    let hub: RpcHub<ServerToClient, ClientToServer>

    beforeEach(async () => {
        server = new WebSocketServer({ port: 0 })
        await once(server, 'listening')
        hub = startHub()
    })

    afterEach(async () => {
        hub.$.destroy()
        await new Promise((resolve) => server.close(resolve))
    })

    function startHub(): RpcHub<ServerToClient, ClientToServer> {
        const created = createRpcHub<ServerToClient, ClientToServer>(new WebSocketHubAdapter(server))
        created.$.handle('add', (_context, a, b) => a + b)
        return created
    }

    function startClient() {
        const { port } = server.address() as AddressInfo
        return createRpcChannel<ClientToServer, ServerToClient>(
            new WebSocketClientAdapter(`ws://localhost:${String(port)}`),
            { queueEnabled: true },
        )
    }

    it('should call the server from the client', async () => {
        const channel = startClient()

        await expect(channel.add(2, 3)).resolves.toBe(5)

        channel.$.destroy()
    })

    it('should call the client from the server', async () => {
        const answer = new Promise<string>((resolve) => {
            hub.$.on('rpc.peer.connected', (peer) => {
                void peer.channel.whoAreYou().then(resolve)
            })
        })
        const channel = startClient()
        channel.$.handle('whoAreYou', () => 'client')

        await expect(answer).resolves.toBe('client')

        channel.$.destroy()
    })

    it('should remove the peer once the client destroys its channel', async () => {
        const channel = startClient()
        await channel.add(1, 1)
        const disconnected = new Promise<void>((resolve) => hub.$.on('rpc.peer.disconnected', () => resolve()))

        channel.$.destroy()

        await expect(disconnected).resolves.toBeUndefined()
        expect(hub.$.peers).toHaveLength(0)
    })

    it('should reconnect once the server accepts connections again', async () => {
        const channel = startClient()
        await channel.add(1, 1)
        const disconnected = new Promise<void>((resolve) => channel.$.on('rpc.disconnected', () => resolve()))

        hub.$.destroy()
        await disconnected
        hub = startHub()

        await expect(channel.add(2, 2)).resolves.toBe(4)
        expect(channel.$.status).toBe(ConnectionStatus.CONNECTED)

        channel.$.destroy()
    })
})
