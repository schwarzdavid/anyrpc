import { describe, expect, it, vi } from 'vitest'
import { AbstractRpcAdapter, ConnectionHandler, MessageHandler } from '@/lib/AbstractRpcAdapter'
import { RpcMessage } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'

interface TestMethods {
    exampleMethod: (foo: string, bar: number) => Promise<string>
}

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

class RpcAdapterImpl extends AbstractRpcAdapter<TestMethods, TestEvents> {
    override sendMessage = vi.fn<(message: RpcMessage<TestMethods, TestEvents>) => unknown>()

    async triggerMessage(message: RpcMessage<TestMethods, TestEvents>) {
        await this.onMessage(message)
    }

    triggerConnection() {
        this.connectionStatus = ConnectionStatus.CONNECTED
    }
}

describe(AbstractRpcAdapter, () => {
    it('should set message handler', () => {
        const adapter = new RpcAdapterImpl()
        const messageHandler = vi.fn<MessageHandler>()

        adapter.messageHandler = messageHandler

        const savedHandler = (adapter as any)._messageHandler

        expect(savedHandler).toBe(messageHandler)
    })

    it('should set connection handler', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()

        adapter.connectionHandler = connectionHandler

        const savedHandler = (adapter as any)._connectionHandler

        expect(savedHandler).toBe(connectionHandler)
    })

    it('should call message handler on message', async () => {
        const adapter = new RpcAdapterImpl()
        const messageHandler = vi.fn<MessageHandler>()
        const message: RpcMessage<TestMethods, TestEvents> = {
            jsonrpc: '2.0',
            id: 'test-id',
            method: 'exampleMethod',
            params: ['foo', 1],
        }

        adapter.messageHandler = messageHandler
        await adapter.triggerMessage(message)

        expect(messageHandler).toHaveBeenCalledWith(message)
    })

    it('should call connection handler when connected', async () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()

        adapter.connectionHandler = connectionHandler
        adapter.triggerConnection()

        expect(connectionHandler).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)
    })
})
