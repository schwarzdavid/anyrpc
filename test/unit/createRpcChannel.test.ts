import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { AbstractRpcAdapter } from '@/lib/AbstractRpcAdapter'
import { RpcError } from '@/lib/RpcError'
import { RPC_ERROR_MESSAGE_MAP, RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import type { RpcMessage, RpcRequest, RpcResponse } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import type { MethodMap } from '@/types/MethodMap'

interface TestMethods {
    add(a: number, b: number): Promise<number>
    subtract(a: number, b: number): number
    log(message: string): void
}

interface TestEvents {
    onEvent(message: string): boolean
    objectEvent(message: string): Record<string, string>
    notifyEvent(message: string): void
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

    async triggerMessageHandler(message: unknown) {
        await this.onMessage(message as object)
    }

    triggerConnectionHandler(status: ConnectionStatus = ConnectionStatus.CONNECTED) {
        this.connectionStatus = status
    }
}

function request(method: string, params?: unknown) {
    return { jsonrpc: '2.0', id: 'request-id', method, ...(params === undefined ? {} : { params }) }
}

function notification(method: string, params: unknown = []) {
    return { jsonrpc: '2.0', method, params }
}

function errorResponse(code: RpcErrorCode) {
    return { jsonrpc: '2.0', id: 'request-id', error: new RpcError(code).toJSON() }
}

describe(createRpcChannel, () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('calling remote methods', () => {
        it('should send an RPC request and resolve with the correct result', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            adapter.sendMessage.mockImplementationOnce((message) => {
                expect(message).toMatchObject({ jsonrpc: '2.0', method: 'add', params: [2, 3] })

                void adapter.triggerMessageHandler({
                    jsonrpc: '2.0',
                    id: (message as RpcRequest<TestMethods>).id,
                    result: 5,
                })
            })

            await expect(rpcChannel.add(2, 3)).resolves.toBe(5)
        })

        it('should reject with an RpcError on error responses', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            adapter.sendMessage.mockImplementationOnce((message) => {
                void adapter.triggerMessageHandler({
                    jsonrpc: '2.0',
                    id: (message as RpcRequest<TestMethods>).id,
                    error: { code: RpcErrorCode.SERVER_ERROR, message: 'Server error' },
                })
            })

            await expect(rpcChannel.add(2, 3)).rejects.toThrowError(RpcError)
        })

        it('should timeout if no response is received', async () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter, { timeout: 100 })

            const messagePromise = rpcChannel.add(2, 3)
            vi.runAllTimers()

            await expect(messagePromise).rejects.toThrowError(new RpcError(RpcErrorCode.TIMEOUT_ERROR))
        })

        it('should throw if not connected and the queue is disabled', () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            expect(() => rpcChannel.add(2, 3)).toThrowError(new RpcError(RpcErrorCode.NOT_CONNECTED))
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should refuse to call reserved rpc. methods', () => {
            const adapter = new MockAdapter<Record<string, () => void>>()
            const rpcChannel = createRpcChannel(adapter) as unknown as Record<string, () => Promise<void>>

            expect(() => rpcChannel['rpc.discover']?.()).toThrowError(
                'Cannot call "rpc.discover": method names starting with "rpc." are reserved by JSON-RPC 2.0',
            )
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })
    })

    describe('sending notifications', () => {
        it('should send a message without id and not wait for a response', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            const result = rpcChannel.log.notify('hello')

            expect(result).toBeUndefined()
            expect(adapter.sendMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'log', params: ['hello'] })
        })

        it('should throw if not connected and the queue is disabled', () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            expect(() => rpcChannel.log.notify('hello')).toThrowError(new RpcError(RpcErrorCode.NOT_CONNECTED))
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should refuse to notify reserved rpc. methods', () => {
            const adapter = new MockAdapter<Record<string, () => void>>()
            const rpcChannel = createRpcChannel(adapter) as unknown as Record<string, { notify(): void }>

            expect(() => rpcChannel['rpc.discover']?.notify()).toThrowError(
                'Cannot notify "rpc.discover": method names starting with "rpc." are reserved by JSON-RPC 2.0',
            )
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })
    })

    describe('connection queue', () => {
        it('should queue requests and notifications until the connection is established', async () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true })

            adapter.sendMessage.mockImplementationOnce((message) => {
                void adapter.triggerMessageHandler({
                    id: (message as RpcRequest<TestMethods>).id,
                    jsonrpc: '2.0',
                    result: 5,
                } satisfies RpcResponse<TestMethods>)
            })
            const addPromise = rpcChannel.add(2, 3)
            rpcChannel.log.notify('queued')

            expect(adapter.sendMessage).not.toHaveBeenCalled()

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            expect(adapter.sendMessage).toHaveBeenCalledTimes(2)
            expect(adapter.sendMessage).toHaveBeenLastCalledWith({ jsonrpc: '2.0', method: 'log', params: ['queued'] })
            await expect(addPromise).resolves.toBe(5)
        })

        it('should reject queued requests when the queue timeout is reached', async () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true, queueTimeout: 100 })

            const addPromise = rpcChannel.add(2, 3)
            vi.advanceTimersByTime(500)

            await expect(addPromise).rejects.toThrowError(new RpcError(RpcErrorCode.TIMEOUT_ERROR))

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should drop queued notifications with a warning when the queue timeout is reached', () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true, queueTimeout: 100 })

            rpcChannel.log.notify('dropped')
            vi.advanceTimersByTime(500)
            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            expect(adapter.sendMessage).not.toHaveBeenCalled()
            expect(console.warn).toHaveBeenCalledWith(
                '[RpcChannel]',
                'Dropped notification "log": no connection within queueTimeout',
            )
        })

        it('should send queued requests in sequence if queueAwait is set', async () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true, queueAwait: true, timeout: 1000 })

            let previousCall: string | null = null

            adapter.sendMessage.mockImplementationOnce((message) => {
                const queuedRequest = message as RpcRequest<TestMethods>
                void vi.advanceTimersByTimeAsync(500).then(() => {
                    expect(previousCall).toBeNull()

                    previousCall = queuedRequest.method

                    void adapter.triggerMessageHandler({ id: queuedRequest.id, jsonrpc: '2.0', result: 5 })
                })
            })

            adapter.sendMessage.mockImplementationOnce((message) => {
                const queuedRequest = message as RpcRequest<TestMethods>

                expect(previousCall).toBe('add')

                void adapter.triggerMessageHandler({
                    id: queuedRequest.id,
                    jsonrpc: '2.0',
                    error: new RpcError(RpcErrorCode.SERVER_ERROR).toJSON(),
                })
            })

            const addPromise = rpcChannel.add(2, 3)
            const subtractPromise = rpcChannel.subtract(3, 4)

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            await Promise.all([addPromise, subtractPromise.catch(() => undefined)])

            expect(adapter.sendMessage).toHaveBeenCalledTimes(2)
            await expect(addPromise).resolves.toBe(5)
            await expect(subtractPromise).rejects.toThrowError(new RpcError(RpcErrorCode.SERVER_ERROR))
        })
    })

    describe('handling incoming requests', () => {
        it('should respond with the result of the handler', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const handler = vi.fn<(message: string) => Record<string, string>>().mockReturnValue({ foo: 'bar' })

            rpcChannel.$.handle('objectEvent', handler)
            await adapter.triggerMessageHandler(request('objectEvent', ['hi']))

            expect(handler).toHaveBeenCalledWith('hi')
            expect(adapter.sendMessage).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 'request-id',
                result: { foo: 'bar' },
            })
        })

        it('should respond with the resolved value of async handlers', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.$.handle('onEvent', () => Promise.resolve(true))
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(adapter.sendMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 'request-id', result: true })
        })

        it('should respond with null if the handler returns undefined', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.$.handle('notifyEvent', vi.fn<(message: string) => void>())
            await adapter.triggerMessageHandler(request('notifyEvent', ['hi']))

            expect(adapter.sendMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 'request-id', result: null })
        })

        it('should call the handler without arguments if params are omitted', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const handler = vi.fn<(message: string) => boolean>().mockReturnValue(true)

            rpcChannel.$.handle('onEvent', handler)
            await adapter.triggerMessageHandler(request('onEvent'))

            expect(handler).toHaveBeenCalledWith()
        })

        it('should call on-listeners in addition to the handler', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const listener = vi.fn<(message: string) => void>()

            rpcChannel.$.handle('onEvent', () => true)
            rpcChannel.$.on('onEvent', listener)
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(listener).toHaveBeenCalledWith('hi')
            expect(adapter.sendMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 'request-id', result: true })
        })

        it('should log listener errors without affecting the response', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const error = new Error('listener failed')

            rpcChannel.$.handle('onEvent', () => true)
            rpcChannel.$.on('onEvent', () => {
                throw error
            })
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(console.error).toHaveBeenCalledWith('[RpcChannel]', 'Listener for "onEvent" threw an error', error)
            expect(adapter.sendMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 'request-id', result: true })
        })

        it('should respond with method not found without calling listeners if no handler is registered', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const listener = vi.fn<(message: string) => void>()

            rpcChannel.$.on('onEvent', listener)
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(listener).not.toHaveBeenCalled()
            expect(adapter.sendMessage).toHaveBeenCalledWith(errorResponse(RpcErrorCode.METHOD_NOT_FOUND))
        })

        it('should call listeners and respond with method not found if unhandledRequests is observe', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter, { unhandledRequests: 'observe' })
            const listener = vi.fn<(message: string) => void>()

            rpcChannel.$.on('onEvent', listener)
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(listener).toHaveBeenCalledWith('hi')
            expect(adapter.sendMessage).toHaveBeenCalledWith(errorResponse(RpcErrorCode.METHOD_NOT_FOUND))
        })

        it('should respond with method not found for reserved rpc. methods', async () => {
            const adapter = new MockAdapter()
            createRpcChannel(adapter, { unhandledRequests: 'observe' })

            await adapter.triggerMessageHandler(request('rpc.discover', []))

            expect(adapter.sendMessage).toHaveBeenCalledWith(errorResponse(RpcErrorCode.METHOD_NOT_FOUND))
        })

        it('should respond with invalid params for named params', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const handler = vi.fn<(message: string) => boolean>()

            rpcChannel.$.handle('onEvent', handler)
            await adapter.triggerMessageHandler(request('onEvent', { message: 'hi' }))

            expect(handler).not.toHaveBeenCalled()
            expect(adapter.sendMessage).toHaveBeenCalledWith(errorResponse(RpcErrorCode.INVALID_PARAMS))
        })

        it('should respond with a server error if the handler throws', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.$.handle('onEvent', () => {
                throw new Error('Error')
            })
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(adapter.sendMessage).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 'request-id',
                error: {
                    code: RpcErrorCode.SERVER_ERROR,
                    message: RPC_ERROR_MESSAGE_MAP[RpcErrorCode.SERVER_ERROR],
                    data: { message: 'Error', name: 'Error', stack: undefined },
                },
            })
        })

        it('should forward RpcErrors with application error codes thrown by handlers', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.$.handle('onEvent', () => {
                throw new RpcError({ code: 4001, message: 'Insufficient funds', data: { balance: 0 } })
            })
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(adapter.sendMessage).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 'request-id',
                error: { code: 4001, message: 'Insufficient funds', data: { balance: 0 } },
            })
        })

        it.each([RpcErrorCode.METHOD_NOT_FOUND, RpcErrorCode.TIMEOUT_ERROR])(
            'should wrap RpcErrors with non-application code %i in a server error',
            async (code) => {
                const adapter = new MockAdapter()
                const rpcChannel = createRpcChannel(adapter)

                rpcChannel.$.handle('onEvent', () => {
                    throw new RpcError(code)
                })
                await adapter.triggerMessageHandler(request('onEvent', ['hi']))

                expect(adapter.sendMessage).toHaveBeenCalledWith({
                    jsonrpc: '2.0',
                    id: 'request-id',
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

            rpcChannel.$.handle('onEvent', () => {
                throw new Error('Error')
            })
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(adapter.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({
                        data: { message: 'Error', name: 'Error', stack: expect.any(String) },
                    }),
                }),
            )
        })
    })

    describe('handling incoming notifications', () => {
        it('should call the handler and listeners without sending a response', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const handler = vi.fn<(message: string) => void>()
            const listener = vi.fn<(message: string) => void>()

            rpcChannel.$.handle('notifyEvent', handler)
            rpcChannel.$.on('notifyEvent', listener)
            await adapter.triggerMessageHandler(notification('notifyEvent', ['hi']))

            expect(handler).toHaveBeenCalledWith('hi')
            expect(listener).toHaveBeenCalledWith('hi')
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should call listeners even if no handler is registered', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const listener = vi.fn<(message: string) => void>()

            rpcChannel.$.on('notifyEvent', listener)
            await adapter.triggerMessageHandler(notification('notifyEvent', ['hi']))

            expect(listener).toHaveBeenCalledWith('hi')
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should log handler errors without sending a response', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const error = new Error('handler failed')

            rpcChannel.$.handle('notifyEvent', () => {
                throw error
            })
            await adapter.triggerMessageHandler(notification('notifyEvent', ['hi']))

            expect(console.error).toHaveBeenCalledWith(
                '[RpcChannel]',
                'Handler for notification "notifyEvent" threw an error',
                error,
            )
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should ignore notifications for reserved rpc. methods', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const connectedListener = vi.fn<() => void>()

            rpcChannel.$.on('rpc.connected', connectedListener)
            await adapter.triggerMessageHandler(notification('rpc.connected'))

            expect(connectedListener).not.toHaveBeenCalled()
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should ignore notifications with named params and log a warning', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const listener = vi.fn<(message: string) => void>()

            rpcChannel.$.on('notifyEvent', listener)
            await adapter.triggerMessageHandler(notification('notifyEvent', { message: 'hi' }))

            expect(listener).not.toHaveBeenCalled()
            expect(console.warn).toHaveBeenCalledWith(
                '[RpcChannel]',
                'Ignoring notification "notifyEvent": named params are not supported',
            )
        })
    })

    describe('$', () => {
        it('should throw when registering a second handler for a method', () => {
            const rpcChannel = createRpcChannel(new MockAdapter())

            rpcChannel.$.handle('onEvent', () => true)

            expect(() => rpcChannel.$.handle('onEvent', () => false)).toThrowError(
                'A handler for "onEvent" is already registered',
            )
        })

        it('should stop handling requests after the handler was removed', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            const removeHandler = rpcChannel.$.handle('onEvent', () => true)
            removeHandler()
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(adapter.sendMessage).toHaveBeenCalledWith(errorResponse(RpcErrorCode.METHOD_NOT_FOUND))
        })

        it('should refuse handlers for reserved rpc. methods', () => {
            const rpcChannel = createRpcChannel(new MockAdapter<TestMethods, Record<string, () => void>>())

            expect(() => rpcChannel.$.handle('rpc.discover' as never, () => undefined)).toThrowError(
                'Cannot handle "rpc.discover": method names starting with "rpc." are reserved by JSON-RPC 2.0',
            )
        })

        it('should stop calling a listener after it was removed', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const listener = vi.fn<(message: string) => void>()

            const removeListener = rpcChannel.$.on('notifyEvent', listener)
            removeListener()
            await adapter.triggerMessageHandler(notification('notifyEvent', ['hi']))

            expect(listener).not.toHaveBeenCalled()
        })

        it('should emit rpc.status and rpc.connected when connecting', async () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter)
            const statusListener = vi.fn<(status: ConnectionStatus) => void>()
            const connectedListener = vi.fn<() => void>()

            rpcChannel.$.on('rpc.status', statusListener)
            rpcChannel.$.on('rpc.connected', connectedListener)
            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            expect(statusListener).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)

            await vi.waitFor(() => expect(connectedListener).toHaveBeenCalledWith())
        })

        it('should emit rpc.status and rpc.disconnected when disconnecting', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const statusListener = vi.fn<(status: ConnectionStatus) => void>()
            const disconnectedListener = vi.fn<() => void>()

            rpcChannel.$.on('rpc.status', statusListener)
            rpcChannel.$.on('rpc.disconnected', disconnectedListener)
            adapter.triggerConnectionHandler(ConnectionStatus.DISCONNECTED)

            expect(statusListener).toHaveBeenCalledWith(ConnectionStatus.DISCONNECTED)
            expect(disconnectedListener).toHaveBeenCalledWith()
        })

        it('should contain the current status of the adapter', () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter)

            const statusBeforeConnection = rpcChannel.$.status
            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            expect(statusBeforeConnection).toBe(ConnectionStatus.DISCONNECTED)
            expect(rpcChannel.$.status).toBe(ConnectionStatus.CONNECTED)
        })

        it('should destroy the adapter', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const destroySpy = vi.spyOn(adapter, 'destroy')

            rpcChannel.$.destroy()

            expect(destroySpy).toHaveBeenCalledWith()
        })
    })

    describe('proxy', () => {
        it('should return object builtins without sending messages', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            expect(rpcChannel.toString()).toBe('[object Object]')
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
    })

    it('should connect automatically by default', () => {
        const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
        createRpcChannel(adapter)

        expect(adapter.connect).toHaveBeenCalledWith()
    })

    it('should not connect if autoConnect is false', () => {
        const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
        createRpcChannel(adapter, { autoConnect: false })

        expect(adapter.connect).not.toHaveBeenCalled()
    })
})
