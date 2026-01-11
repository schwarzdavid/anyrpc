import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { AbstractRpcAdapter } from '@/lib/AbstractRpcAdapter'
import { RpcError } from '@/lib/RpcError'
import { RPC_ERROR_NAME_MAP, RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { RpcMessage, RpcRequest, RpcResponse } from '@/types/RpcMessages'
import { EventEmitter } from '@/lib/EventEmitter'
import { ConnectionStatus } from '@/types/ConnectionStatus'

interface TestMethods {
    add(a: number, b: number): Promise<number>
    subtract(a: number, b: number): number
}

interface TestEvents {
    onEvent(message: string): boolean
    objectEvent(message: string): Record<string, string>
}

class MockAdapter extends AbstractRpcAdapter<TestMethods, TestEvents> {
    constructor() {
        super()
        this.connectionStatus = ConnectionStatus.CONNECTED
    }

    sendMessage = vi.fn<(msg: RpcMessage<TestMethods, TestEvents>) => unknown>()

    async triggerMessageHandler(message: any) {
        const handler = (this as any)._messageHandler
        await handler?.(message)
    }

    async triggerConnectionHandler(status: ConnectionStatus = ConnectionStatus.CONNECTED) {
        const handler = (this as any)._connectionHandler
        await handler?.(status)
    }
}

describe(createRpcChannel, () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('should send an RPC request and resolve with the correct result', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

        adapter.sendMessage.mockImplementationOnce((message) => {
            const { id } = message

            expect(message).toMatchObject({
                jsonrpc: '2.0',
                method: 'add',
                params: [2, 3],
            })

            void adapter.triggerMessageHandler({
                jsonrpc: '2.0',
                type: 'response',
                id,
                result: 5,
            })
        })

        const result = await rpcChannel.add(2, 3)

        expect(result).toBe(5)

        adapter.sendMessage.mockRestore()
    })

    it('should handle an RPC error response correctly', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

        adapter.sendMessage.mockImplementationOnce(({ id }) => {
            void adapter.triggerMessageHandler({
                jsonrpc: '2.0',
                id,
                error: { code: RpcErrorCode.SERVER_ERROR, message: 'Server error' },
            })
        })

        await expect(() => rpcChannel.add(2, 3)).rejects.toThrowError(RpcError)
    })

    it('should timeout if no response is received', async () => {
        vi.useFakeTimers()

        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter, { timeout: 100 })

        const messagePromise = rpcChannel.add(2, 3)
        vi.runAllTimers()

        await expect(messagePromise).rejects.toThrowError(RpcError)
    })

    it('should trigger an event when dispatched', () => {
        const eventEmitterSpy = vi.spyOn(EventEmitter.prototype, 'addEventListener')

        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)

        const onEventMock = vi.fn<(message: string) => boolean>()
        rpcChannel.addEventListener('onEvent', onEventMock)

        const mockRequest = {
            jsonrpc: '2.0',
            id: 'event-id',
            method: 'onEvent',
            params: ['Hello, world!'],
        }

        void adapter.triggerMessageHandler(mockRequest)

        expect(eventEmitterSpy).toHaveBeenCalledWith('onEvent', onEventMock)
        expect(onEventMock).toHaveBeenCalledWith('Hello, world!')
    })

    it('should pass event result to response on success', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const onEventMock = vi.fn<(message: string) => Record<string, string>>().mockReturnValue({ foo: 'bar' })
        const mockRequest: RpcRequest<TestEvents> = {
            jsonrpc: '2.0',
            id: 'event-id',
            method: 'objectEvent',
            params: ['Hello, world!'],
        }

        rpcChannel.addEventListener('objectEvent', onEventMock)
        await adapter.triggerMessageHandler(mockRequest)

        expect(onEventMock).toHaveBeenCalledWith('Hello, world!')
        expect(adapter.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                jsonrpc: '2.0',
                id: 'event-id',
                result: { foo: 'bar' },
            } satisfies RpcResponse<TestEvents>),
        )
    })

    it('should pass event error to response on error', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const onEventMock = vi.fn<(message: string) => Record<string, string>>().mockImplementation(() => {
            throw new Error('Error')
        })
        const mockRequest: RpcRequest<TestEvents> = {
            jsonrpc: '2.0',
            id: 'event-id',
            method: 'objectEvent',
            params: ['Hello, world!'],
        }

        rpcChannel.addEventListener('objectEvent', onEventMock)
        await adapter.triggerMessageHandler(mockRequest)

        expect(onEventMock).toHaveBeenCalledWith('Hello, world!')
        expect(adapter.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                jsonrpc: '2.0',
                id: 'event-id',
                error: {
                    code: RpcErrorCode.SERVER_ERROR,
                    message: RPC_ERROR_NAME_MAP[RpcErrorCode.SERVER_ERROR],

                    // TODO: improve error serialization & make error details configurable. @see todo in createRpcChannel.ts
                    data: expect.anything(),
                },
            }),
        )
    })

    it('should return objects builtins', () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const addEventListenerSpy = vi.spyOn(EventEmitter.prototype, 'addEventListener')
        const removeEventListenerSpy = vi.spyOn(EventEmitter.prototype, 'removeEventListener')

        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const prototypeName = rpcChannel.toString()

        expect(prototypeName).toBe('[object Object]')
        expect(adapter.sendMessage).not.toHaveBeenCalled()
        expect(addEventListenerSpy).not.toHaveBeenCalled()
        expect(removeEventListenerSpy).not.toHaveBeenCalled()
    })

    it('should return empty response if no active event handler is set', async () => {
        const adapter = new MockAdapter()
        createRpcChannel<TestMethods, TestEvents>(adapter)

        await adapter.triggerMessageHandler({
            id: 'event-id',
            jsonrpc: '2.0',
            method: 'onEvent',
            params: ['Hello, world!'],
        })

        expect(adapter.sendMessage).toHaveBeenCalledWith({
            id: 'event-id',
            jsonrpc: '2.0',
            result: undefined,
        })
    })

    it('should fire connection event when connection handler is called', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)
        const connectionHandler = vi.fn<(status: ConnectionStatus) => void>()

        rpcChannel.$.addEventListener('connection-change', connectionHandler)

        await adapter.triggerConnectionHandler()

        expect(connectionHandler).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)
    })

    it.todo('should always return meta object when calling $')

    it.todo('should allow to add events to meta object')

    it.todo('should allow to remove events from meta object')

    it.todo('should allow to call destroy on meta object')

    it.todo('should contain current status of adapter on meta object')

    it.todo('should queue messages before connection is established if enabled')

    it.todo('should not queue messages before connection is established if disabled')

    it.todo('should reject if queue timeout is reached')

    it.todo('should run queued messages in sequence if option is set')
})
