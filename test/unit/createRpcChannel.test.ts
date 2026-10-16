import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { AbstractRpcAdapter } from '@/lib/AbstractRpcAdapter'
import { RpcError } from '@/lib/RpcError'
import { RPC_ERROR_MESSAGE_MAP, RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import type { RpcMessage, RpcRequest, RpcResponse } from '@/types/RpcMessages'
import { EventEmitter } from '@/lib/EventEmitter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import type { MethodMap } from '@/types/MethodMap'

interface TestMethods {
    add(a: number, b: number): Promise<number>
    subtract(a: number, b: number): number
}

interface TestEvents {
    onEvent(message: string): boolean
    objectEvent(message: string): Record<string, string>
}

class MockAdapter<M extends MethodMap<M> = TestMethods, E extends MethodMap<E> = TestEvents> extends AbstractRpcAdapter<
    M,
    E
> {
    constructor(initialStatus: ConnectionStatus = ConnectionStatus.CONNECTED) {
        super()
        this.connectionStatus = initialStatus
    }

    sendMessage = vi.fn<(msg: RpcMessage<M, E>) => unknown>()

    connect = vi.fn<() => void>()

    async triggerMessageHandler(message: any) {
        const handler = (this as any)._messageHandler
        await handler?.(message)
    }

    triggerConnectionHandler(status: ConnectionStatus = ConnectionStatus.CONNECTED) {
        this.connectionStatus = status
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
                    message: RPC_ERROR_MESSAGE_MAP[RpcErrorCode.SERVER_ERROR],
                    data: { message: 'Error', name: 'Error', stack: undefined },
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

    it('should respond with method not found if no listener is registered', async () => {
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
            error: new RpcError(RpcErrorCode.METHOD_NOT_FOUND).toJSON(),
        })
    })

    it('should respond with method not found for reserved rpc. methods', async () => {
        const adapter = new MockAdapter<TestMethods, Record<string, () => string>>()
        const rpcChannel = createRpcChannel(adapter)
        const listener = vi.fn<() => string>().mockReturnValue('value')

        rpcChannel.addEventListener('rpc.discover', listener)
        await adapter.triggerMessageHandler({ id: 'event-id', jsonrpc: '2.0', method: 'rpc.discover', params: [] })

        expect(listener).not.toHaveBeenCalled()
        expect(adapter.sendMessage).toHaveBeenCalledWith({
            id: 'event-id',
            jsonrpc: '2.0',
            error: new RpcError(RpcErrorCode.METHOD_NOT_FOUND).toJSON(),
        })
    })

    it('should respond with null result if only passive listeners are registered', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const passiveListener = vi.fn<(message: string) => void>()

        rpcChannel.addEventListener('onEvent', passiveListener, { passive: true })
        await adapter.triggerMessageHandler({ id: 'event-id', jsonrpc: '2.0', method: 'onEvent', params: ['hi'] })

        expect(passiveListener).toHaveBeenCalledWith('hi')
        expect(adapter.sendMessage).toHaveBeenCalledWith({ id: 'event-id', jsonrpc: '2.0', result: null })
    })

    it('should respond with null result if the listener returns undefined', async () => {
        const adapter = new MockAdapter<TestMethods, { notify(): void }>()
        const rpcChannel = createRpcChannel(adapter)

        rpcChannel.addEventListener('notify', vi.fn<() => void>())
        await adapter.triggerMessageHandler({ id: 'event-id', jsonrpc: '2.0', method: 'notify', params: [] })

        expect(adapter.sendMessage).toHaveBeenCalledWith({ id: 'event-id', jsonrpc: '2.0', result: null })
    })

    it('should call the listener without arguments if params are omitted', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const listener = vi.fn<(message: string) => boolean>().mockReturnValue(true)

        rpcChannel.addEventListener('onEvent', listener)
        await adapter.triggerMessageHandler({ id: 'event-id', jsonrpc: '2.0', method: 'onEvent' })

        expect(listener).toHaveBeenCalledWith()
        expect(adapter.sendMessage).toHaveBeenCalledWith({ id: 'event-id', jsonrpc: '2.0', result: true })
    })

    it('should respond with invalid params for named params', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const listener = vi.fn<(message: string) => boolean>()

        rpcChannel.addEventListener('onEvent', listener)
        await adapter.triggerMessageHandler({
            id: 'event-id',
            jsonrpc: '2.0',
            method: 'onEvent',
            params: { message: 'hi' },
        })

        expect(listener).not.toHaveBeenCalled()
        expect(adapter.sendMessage).toHaveBeenCalledWith({
            id: 'event-id',
            jsonrpc: '2.0',
            error: new RpcError(RpcErrorCode.INVALID_PARAMS).toJSON(),
        })
    })

    it('should forward RpcErrors with application error codes thrown by listeners', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const applicationError = new RpcError({ code: 4001, message: 'Insufficient funds', data: { balance: 0 } })

        rpcChannel.addEventListener('onEvent', () => {
            throw applicationError
        })
        await adapter.triggerMessageHandler({ id: 'event-id', jsonrpc: '2.0', method: 'onEvent', params: ['hi'] })

        expect(adapter.sendMessage).toHaveBeenCalledWith({
            id: 'event-id',
            jsonrpc: '2.0',
            error: { code: 4001, message: 'Insufficient funds', data: { balance: 0 } },
        })
    })

    it.each([RpcErrorCode.METHOD_NOT_FOUND, RpcErrorCode.TIMEOUT_ERROR])(
        'should wrap RpcErrors with non-application code %i in a server error',
        async (code) => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.addEventListener('onEvent', () => {
                throw new RpcError(code)
            })
            await adapter.triggerMessageHandler({ id: 'event-id', jsonrpc: '2.0', method: 'onEvent', params: ['hi'] })

            expect(adapter.sendMessage).toHaveBeenCalledWith({
                id: 'event-id',
                jsonrpc: '2.0',
                error: {
                    code: RpcErrorCode.SERVER_ERROR,
                    message: RPC_ERROR_MESSAGE_MAP[RpcErrorCode.SERVER_ERROR],
                    data: expect.objectContaining({ name: 'Error' }),
                },
            })
        },
    )

    it('should include the stack trace in error responses if errorIncludeStack is set', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter, { errorIncludeStack: true })

        rpcChannel.addEventListener('onEvent', () => {
            throw new Error('Error')
        })
        await adapter.triggerMessageHandler({ id: 'event-id', jsonrpc: '2.0', method: 'onEvent', params: ['hi'] })

        expect(adapter.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    data: { message: 'Error', name: 'Error', stack: expect.any(String) },
                }),
            }),
        )
    })

    it('should refuse to call reserved rpc. methods', () => {
        const adapter = new MockAdapter<Record<string, () => void>>()
        const rpcChannel = createRpcChannel(adapter) as unknown as Record<string, () => Promise<void>>

        expect(() => rpcChannel['rpc.discover']?.()).toThrowError(
            'Cannot call "rpc.discover": method names starting with "rpc." are reserved by JSON-RPC 2.0',
        )
        expect(adapter.sendMessage).not.toHaveBeenCalled()
    })

    it('should not be treated as thenable', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)

        expect((rpcChannel as unknown as Record<string, unknown>).then).toBeUndefined()
        await expect(Promise.resolve(rpcChannel)).resolves.toBe(rpcChannel)
        expect(adapter.sendMessage).not.toHaveBeenCalled()
    })

    it('should return undefined for unknown symbol properties', () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)

        expect((rpcChannel as unknown as Record<symbol, unknown>)[Symbol.toPrimitive]).toBeUndefined()
        expect(adapter.sendMessage).not.toHaveBeenCalled()
    })

    it('should always return meta object when calling $', () => {
        const adapter = new MockAdapter()
        const channel = createRpcChannel(adapter)

        expect(channel.$).toStrictEqual({
            status: expect.any(String),
            addEventListener: expect.any(Function),
            removeEventListener: expect.any(Function),
            destroy: expect.any(Function),
        })
    })

    it('should fire connection event when connection handler is called', () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const connectionHandler = vi.fn<(status: ConnectionStatus) => void>()

        rpcChannel.$.addEventListener('connection-change', connectionHandler)

        adapter.triggerConnectionHandler()

        expect(connectionHandler).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)
    })

    it('should allow to remove events from meta object', () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const connectionHandler = vi.fn<(status: ConnectionStatus) => void>()

        rpcChannel.$.addEventListener('connection-change', connectionHandler)
        rpcChannel.$.removeEventListener('connection-change', connectionHandler)

        adapter.triggerConnectionHandler()

        expect(connectionHandler).not.toHaveBeenCalled()
    })

    it('should allow to call destroy on meta object', () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)
        const destroySpy = vi.spyOn(adapter, 'destroy')

        rpcChannel.$.destroy()

        expect(destroySpy).toHaveBeenCalledWith()
    })

    it('should contain current status of adapter on meta object', () => {
        const adapter = new MockAdapter(ConnectionStatus.CLOSED)
        const rpcChannel = createRpcChannel(adapter)

        const statusBeforeConnection = rpcChannel.$.status

        adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

        const statusAfterConnection = rpcChannel.$.status

        expect(statusBeforeConnection).toBe(ConnectionStatus.CLOSED)
        expect(statusAfterConnection).toBe(ConnectionStatus.CONNECTED)
    })

    it('should queue messages before connection is established if enabled', async () => {
        const adapter = new MockAdapter(ConnectionStatus.CLOSED)
        const rpcChannel = createRpcChannel(adapter, { queueEnabled: true })

        adapter.sendMessage.mockImplementationOnce(({ id }) => {
            void adapter.triggerMessageHandler({
                id,
                jsonrpc: '2.0',
                result: 5,
            } satisfies RpcResponse<TestMethods>)
        })
        const addPromise = rpcChannel.add(2, 3)
        adapter.sendMessage.mockImplementationOnce(({ id }) => {
            void adapter.triggerMessageHandler({
                id,
                jsonrpc: '2.0',
                result: -1,
            })
        })
        const subtractPromise = rpcChannel.subtract(3, 4)

        expect(adapter.sendMessage).not.toHaveBeenCalled()

        adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

        expect(adapter.sendMessage).toHaveBeenCalledTimes(2)

        const [addResult, subtractResult] = await Promise.all([addPromise, subtractPromise])

        expect(addResult).toBe(5)
        expect(subtractResult).toBe(-1)
    })

    it('should not queue messages before connection is established if disabled', () => {
        const adapter = new MockAdapter(ConnectionStatus.CLOSED)
        const rpcChannel = createRpcChannel(adapter)

        expect(() => rpcChannel.add(2, 3)).toThrowError(new RpcError(RpcErrorCode.NOT_CONNECTED))
        expect(adapter.sendMessage).not.toHaveBeenCalled()

        adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

        expect(adapter.sendMessage).not.toHaveBeenCalled()
    })

    it('should reject if queue timeout is reached', async () => {
        vi.useFakeTimers()

        const adapter = new MockAdapter(ConnectionStatus.CLOSED)
        const rpcChannel = createRpcChannel(adapter, { queueEnabled: true, queueTimeout: 100 })

        const addPromise = rpcChannel.add(2, 3)

        vi.advanceTimersByTime(500)

        await expect(addPromise).rejects.toThrowError(new RpcError(RpcErrorCode.TIMEOUT_ERROR))
        expect(adapter.sendMessage).not.toHaveBeenCalled()
    })

    it('should run queued messages in sequence if option is set', async () => {
        vi.useFakeTimers()

        const adapter = new MockAdapter(ConnectionStatus.CLOSED)
        const rpcChannel = createRpcChannel(adapter, { queueEnabled: true, queueAwait: true, timeout: 1000 })

        let previousCall: string | null = null

        adapter.sendMessage.mockImplementationOnce((request) => {
            void vi.advanceTimersByTimeAsync(500).then(() => {
                expect(previousCall).toBeNull()

                previousCall = (request as RpcRequest<TestMethods>).method

                void adapter.triggerMessageHandler({
                    id: request.id,
                    jsonrpc: '2.0',
                    result: 5,
                } satisfies RpcResponse<TestMethods>)
            })
        })

        adapter.sendMessage.mockImplementationOnce((request) => {
            expect(previousCall).toBe('add')

            previousCall = (request as RpcRequest<TestMethods>).method

            void adapter.triggerMessageHandler({
                id: request.id,
                jsonrpc: '2.0',
                error: new RpcError(RpcErrorCode.SERVER_ERROR),
            } satisfies RpcResponse<TestMethods>)
        })

        const addPromise = rpcChannel.add(2, 3)
        const subtractPromise = rpcChannel.subtract(3, 4)

        adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

        await Promise.all([addPromise, subtractPromise.catch(() => undefined)])

        expect(adapter.sendMessage).toHaveBeenCalledTimes(2)
        await expect(addPromise).resolves.toBe(5)
        await expect(subtractPromise).rejects.toThrowError(new RpcError(RpcErrorCode.SERVER_ERROR))
    })

    it('should not connect if autoConnect is false', () => {
        const adapter = new MockAdapter(ConnectionStatus.CLOSED)
        createRpcChannel(adapter, { autoConnect: false })

        expect(adapter.connect).not.toHaveBeenCalled()
    })
})
