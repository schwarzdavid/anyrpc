import { describe, expect, it, vi } from 'vitest'
import {
    AbstractRpcAdapter,
    type ConnectionHandler,
    type ConnectionLostHandler,
    type MessageHandler,
} from '@/lib/adapter/AbstractRpcAdapter'
import type { RpcMessage } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'

interface TestMethods {
    exampleMethod: (foo: string, bar: number) => Promise<string>
}

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

class RpcAdapterImpl extends AbstractRpcAdapter<TestMethods, TestEvents> {
    sendMessage = vi.fn<(message: RpcMessage<TestMethods, TestEvents>) => unknown>()

    connect = vi.fn<() => void>()

    async triggerMessage(message: RpcMessage<TestMethods, TestEvents>) {
        await this.onMessage(message)
    }

    triggerConnection() {
        this.connectionStatus = ConnectionStatus.CONNECTED
    }

    triggerClose() {
        this.closeConnection()
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

    it('should call connection handler when connected', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()

        adapter.connectionHandler = connectionHandler
        adapter.triggerConnection()

        expect(connectionHandler).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)
    })

    it('should not call the connection handler when the status does not change', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()
        adapter.connectionHandler = connectionHandler

        adapter.triggerConnection()
        adapter.triggerConnection()

        expect(connectionHandler).toHaveBeenCalledTimes(1)
    })

    it('should notify the connection lost handler before reporting the disconnect when closing', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()
        const connectionLostHandler = vi.fn<ConnectionLostHandler>()
        adapter.connectionHandler = connectionHandler
        adapter.connectionLostHandler = connectionLostHandler
        adapter.triggerConnection()

        adapter.triggerClose()

        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(connectionHandler).toHaveBeenLastCalledWith(ConnectionStatus.DISCONNECTED)
        expect(connectionLostHandler.mock.invocationCallOrder[0]).toBeLessThan(
            connectionHandler.mock.invocationCallOrder[1]!,
        )
        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should notify the connection lost handler even when already disconnected', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()
        const connectionLostHandler = vi.fn<ConnectionLostHandler>()
        adapter.connectionHandler = connectionHandler
        adapter.connectionLostHandler = connectionLostHandler

        adapter.triggerClose()

        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(connectionHandler).not.toHaveBeenCalled()
    })

    it('should close the connection when destroyed', () => {
        const adapter = new RpcAdapterImpl()
        const connectionLostHandler = vi.fn<ConnectionLostHandler>()
        adapter.connectionLostHandler = connectionLostHandler
        adapter.triggerConnection()

        adapter.destroy()

        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })
})
