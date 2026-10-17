import { assertType, describe, expectTypeOf, it } from 'vitest'
import {
    AbstractRpcAdapter,
    type ConnectionHandler,
    type ConnectionLostHandler,
    ConnectionStatus,
    createRpcChannel,
    LogLevel,
    type MessageHandler,
    type RpcChannel,
    type RpcChannelEvents,
    type RpcChannelOptions,
    RpcError,
    RpcErrorCode,
    type RpcMessage,
} from '@/index'

interface Methods {
    ping(): string
}

interface Events {
    pong(value: string): void
}

describe('anyrpc entry point', () => {
    it('should expose the connection status as string literals', () => {
        expectTypeOf<ConnectionStatus>().toEqualTypeOf<'connected' | 'disconnected'>()
        expectTypeOf(ConnectionStatus.CONNECTED).toEqualTypeOf<'connected'>()

        assertType<ConnectionStatus>('disconnected')
        // @ts-expect-error
        assertType<ConnectionStatus>('connecting')
    })

    it('should expose the error codes as number literals', () => {
        expectTypeOf(RpcErrorCode.CONNECTION_LOST).toEqualTypeOf<-31003>()

        assertType<RpcErrorCode>(-31001)
        // @ts-expect-error
        assertType<RpcErrorCode>(-1)

        expectTypeOf(new RpcError(RpcErrorCode.TIMEOUT_ERROR).code).toBeNumber()
    })

    it('should expose the log levels for the channel options', () => {
        expectTypeOf(LogLevel.NONE).toEqualTypeOf<9999>()

        assertType<RpcChannelOptions['logLevel']>(LogLevel.DEBUG)
        // @ts-expect-error
        assertType<RpcChannelOptions['logLevel']>(42)
    })

    it('should type the channel events with the exported status', () => {
        expectTypeOf<RpcChannelEvents['rpc.status']>().parameters.toEqualTypeOf<[status: ConnectionStatus]>()
        expectTypeOf<RpcChannelEvents['rpc.error']>().parameters.toEqualTypeOf<[error: RpcError]>()
    })

    it('should let consumers write their own adapter', () => {
        class CustomAdapter extends AbstractRpcAdapter<Methods, Events> {
            connect(): void {
                this.connectionStatus = ConnectionStatus.CONNECTED
            }

            sendMessage(message: RpcMessage<Methods, Events>): void {
                void this.onMessage(message)
                this.closeConnection()
            }
        }

        const adapter = new CustomAdapter()
        adapter.messageHandler = (message) => {
            expectTypeOf(message).toEqualTypeOf<string | object>()
        }

        expectTypeOf<MessageHandler>().toBeFunction()
        expectTypeOf<ConnectionHandler>().parameters.toEqualTypeOf<[status: ConnectionStatus]>()
        expectTypeOf<ConnectionLostHandler>().returns.toBeVoid()
        expectTypeOf(createRpcChannel(adapter)).toEqualTypeOf<RpcChannel<Methods, Events>>()
    })
})
