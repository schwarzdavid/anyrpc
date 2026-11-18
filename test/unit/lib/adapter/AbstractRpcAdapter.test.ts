import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    AbstractRpcAdapter,
    type ConnectionHandler,
    type ConnectionLostHandler,
    type MessageHandler,
} from '@/lib/adapter/AbstractRpcAdapter'
import type { RpcMessage } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import { bindAdapter } from '../../__helper/bindAdapter'

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

    warn(message: string) {
        this.logger?.warn(message)
    }
}

describe(AbstractRpcAdapter, () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('should not log before it is bound', () => {
        const adapter = new RpcAdapterImpl()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        adapter.warn('message')

        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('should create a logger with a generic name by default', () => {
        const adapter = new RpcAdapterImpl()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        bindAdapter(adapter, { logLevel: LogLevel.WARN })
        adapter.warn('message')

        expect(warnSpy).toHaveBeenCalledExactlyOnceWith('[RpcAdapter]', 'message')
    })

    it('should name the logger after the logName of the adapter', () => {
        class NamedAdapter extends RpcAdapterImpl {
            protected override readonly logName = 'MyAdapter'
        }
        const adapter = new NamedAdapter()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        bindAdapter(adapter, { logLevel: LogLevel.WARN })
        adapter.warn('message')

        expect(warnSpy).toHaveBeenCalledExactlyOnceWith('[MyAdapter]', 'message')
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

        bindAdapter(adapter, { onMessage: messageHandler })
        await adapter.triggerMessage(message)

        expect(messageHandler).toHaveBeenCalledWith(message)
    })

    it('should call connection handler when connected', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()

        bindAdapter(adapter, { onStatusChange: connectionHandler })
        adapter.triggerConnection()

        expect(connectionHandler).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)
    })

    it('should not call the connection handler when the status does not change', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()
        bindAdapter(adapter, { onStatusChange: connectionHandler })

        adapter.triggerConnection()
        adapter.triggerConnection()

        expect(connectionHandler).toHaveBeenCalledTimes(1)
    })

    it('should notify the connection lost handler before reporting the disconnect when closing', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()
        const connectionLostHandler = vi.fn<ConnectionLostHandler>()
        bindAdapter(adapter, { onStatusChange: connectionHandler })
        bindAdapter(adapter, { onConnectionLost: connectionLostHandler })
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
        bindAdapter(adapter, { onStatusChange: connectionHandler })
        bindAdapter(adapter, { onConnectionLost: connectionLostHandler })

        adapter.triggerClose()

        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(connectionHandler).not.toHaveBeenCalled()
    })

    it('should close the connection when destroyed', () => {
        const adapter = new RpcAdapterImpl()
        const connectionLostHandler = vi.fn<ConnectionLostHandler>()
        bindAdapter(adapter, { onConnectionLost: connectionLostHandler })
        adapter.triggerConnection()

        adapter.destroy()

        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(adapter.connectionStatus).toBe(ConnectionStatus.DESTROYED)
    })

    it('should report the status destroyed once without passing through disconnected', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()
        adapter.triggerConnection()
        bindAdapter(adapter, { onStatusChange: connectionHandler })

        adapter.destroy()
        adapter.destroy()

        expect(connectionHandler.mock.calls).toStrictEqual([[ConnectionStatus.DESTROYED]])
    })

    it('should stay destroyed and keep quiet when the transport reports changes afterwards', () => {
        const adapter = new RpcAdapterImpl()
        const connectionHandler = vi.fn<ConnectionHandler>()
        const connectionLostHandler = vi.fn<ConnectionLostHandler>()
        adapter.destroy()
        bindAdapter(adapter, { onStatusChange: connectionHandler })
        bindAdapter(adapter, { onConnectionLost: connectionLostHandler })

        adapter.triggerConnection()
        adapter.triggerClose()
        adapter.destroy()

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DESTROYED)
        expect(connectionHandler).not.toHaveBeenCalled()
        expect(connectionLostHandler).not.toHaveBeenCalled()
    })
})
