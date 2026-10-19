import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import { RpcError } from '@/lib/RpcError'
import { RPC_ERROR_MESSAGE_MAP, RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import type { RpcMessage, RpcRequest, RpcResponse } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
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

    connect = vi.fn<() => void | Promise<void>>()

    async triggerMessageHandler(message: unknown) {
        await this.onMessage(message as object)
    }

    triggerConnectionHandler(status: ConnectionStatus = ConnectionStatus.CONNECTED) {
        this.connectionStatus = status
    }

    triggerConnectionLost() {
        this.closeConnection()
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

function channelDestroyedError() {
    return new RpcError({ code: RpcErrorCode.NOT_CONNECTED, message: 'The channel was destroyed' })
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

        it('should match responses to their requests regardless of the order they arrive in', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            const addPromise = rpcChannel.add(2, 3)
            const subtractPromise = rpcChannel.subtract(5, 3)
            const [addRequest, subtractRequest] = adapter.sendMessage.mock.calls.map(
                ([message]) => message as RpcRequest<TestMethods>,
            )
            await adapter.triggerMessageHandler({ jsonrpc: '2.0', id: subtractRequest!.id, result: 2 })
            await adapter.triggerMessageHandler({ jsonrpc: '2.0', id: addRequest!.id, result: 5 })

            await expect(subtractPromise).resolves.toBe(2)
            await expect(addPromise).resolves.toBe(5)
        })

        it.each([
            ['a success response', { result: 5 }],
            ['an error response', { error: new RpcError(RpcErrorCode.SERVER_ERROR).toJSON() }],
        ])('should ignore %s for an unknown request id', async (_, response) => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)
            const errorListener = vi.fn<(error: RpcError) => void>()
            rpcChannel.$.on('rpc.error', errorListener)

            await expect(
                adapter.triggerMessageHandler({ jsonrpc: '2.0', id: 'unknown-id', ...response }),
            ).resolves.toBeUndefined()

            expect(errorListener).not.toHaveBeenCalled()
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should ignore a response that arrives after the request timed out', async () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter, { timeout: 100 })

            const messagePromise = rpcChannel.add(2, 3)
            vi.runAllTimers()

            await expect(messagePromise).rejects.toThrowError(new RpcError(RpcErrorCode.TIMEOUT_ERROR))

            const { id } = adapter.sendMessage.mock.calls[0]![0] as RpcRequest<TestMethods>

            await expect(adapter.triggerMessageHandler({ jsonrpc: '2.0', id, result: 5 })).resolves.toBeUndefined()
        })

        it('should reject with the error of the adapter if the request cannot be sent', async () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)
            const cloneError = new Error('() => undefined could not be cloned.')
            adapter.sendMessage.mockImplementationOnce(() => {
                throw cloneError
            })

            await expect(rpcChannel.add(2, 3)).rejects.toBe(cloneError)

            expect(vi.getTimerCount()).toBe(0)
        })

        it('should throw if called after the channel was destroyed', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            rpcChannel.$.destroy()

            expect(() => rpcChannel.add(2, 3)).toThrowError(channelDestroyedError())
        })

        it('should throw if called after the channel was destroyed even if the queue is enabled', () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter, { queueEnabled: true })

            rpcChannel.$.destroy()

            expect(() => rpcChannel.add(2, 3)).toThrowError(channelDestroyedError())
            expect(vi.getTimerCount()).toBe(0)
        })

        it('should timeout if no response is received', async () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter, { timeout: 100 })

            const messagePromise = rpcChannel.add(2, 3)
            vi.runAllTimers()

            await expect(messagePromise).rejects.toThrowError(new RpcError(RpcErrorCode.TIMEOUT_ERROR))
        })

        it('should reject pending requests immediately when the connection is lost', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            const messagePromise = rpcChannel.add(2, 3)
            adapter.triggerConnectionLost()

            await expect(messagePromise).rejects.toThrowError(new RpcError(RpcErrorCode.CONNECTION_LOST))
        })

        it('should keep pending requests waiting while the adapter only reports a disconnect', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            const messagePromise = rpcChannel.add(2, 3)
            adapter.triggerConnectionHandler(ConnectionStatus.DISCONNECTED)
            const { id } = adapter.sendMessage.mock.calls[0]![0] as RpcRequest<TestMethods>
            await adapter.triggerMessageHandler({ jsonrpc: '2.0', id, result: 5 })

            await expect(messagePromise).resolves.toBe(5)
        })

        it('should not reject requests sent after the connection was lost and restored', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

            adapter.triggerConnectionHandler(ConnectionStatus.DISCONNECTED)
            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)
            const messagePromise = rpcChannel.add(2, 3)
            const { id } = adapter.sendMessage.mock.calls[0]![0] as RpcRequest<TestMethods>
            await adapter.triggerMessageHandler({ jsonrpc: '2.0', id, result: 5 })

            await expect(messagePromise).resolves.toBe(5)
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

        it('should throw if notified after the channel was destroyed even if the queue is enabled', () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter, { queueEnabled: true })

            rpcChannel.$.destroy()

            expect(() => rpcChannel.log.notify('hello')).toThrowError(channelDestroyedError())
            expect(vi.getTimerCount()).toBe(0)
        })

        it('should throw the error of the adapter if the notification cannot be sent', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)
            const cloneError = new Error('() => undefined could not be cloned.')
            adapter.sendMessage.mockImplementationOnce(() => {
                throw cloneError
            })

            expect(() => rpcChannel.log.notify('hello')).toThrowError(cloneError)
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

        it('should reject queued requests and drop queued notifications when the channel is destroyed', async () => {
            vi.useFakeTimers()

            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true })
            const addPromise = rpcChannel.add(2, 3)
            rpcChannel.log.notify('queued')

            rpcChannel.$.destroy()

            await expect(addPromise).rejects.toThrowError(new RpcError(RpcErrorCode.CONNECTION_LOST))
            expect(console.warn).toHaveBeenCalledWith(
                '[RpcChannel]',
                'Dropped notification "log": the channel was destroyed',
            )
            expect(vi.getTimerCount()).toBe(0)

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should keep queued messages while the connection is lost and send them once connected', async () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true })
            adapter.sendMessage.mockImplementationOnce((message) => {
                void adapter.triggerMessageHandler({
                    jsonrpc: '2.0',
                    id: (message as RpcRequest<TestMethods>).id,
                    result: 5,
                })
            })
            const addPromise = rpcChannel.add(2, 3)

            adapter.triggerConnectionLost()
            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            await expect(addPromise).resolves.toBe(5)
        })

        it('should keep sending the queue if a queued notification cannot be sent', () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true })
            const connectedListener = vi.fn<() => void>()
            const cloneError = new Error('() => undefined could not be cloned.')
            rpcChannel.$.on('rpc.connected', connectedListener)
            adapter.sendMessage.mockImplementationOnce(() => {
                throw cloneError
            })
            rpcChannel.log.notify('first')
            rpcChannel.log.notify('second')

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            expect(adapter.sendMessage).toHaveBeenLastCalledWith({ jsonrpc: '2.0', method: 'log', params: ['second'] })
            expect(console.error).toHaveBeenCalledWith(
                '[RpcChannel]',
                'Could not send the queued notification "log"',
                cloneError,
            )
            expect(connectedListener).toHaveBeenCalledWith()
        })

        it('should reject a queued request whose id cannot be generated and keep sending the queue', async () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true })
            const connectedListener = vi.fn<() => void>()
            const idError = new Error('No entropy available')
            rpcChannel.$.on('rpc.connected', connectedListener)
            vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementationOnce(() => {
                throw idError
            })
            const addPromise = rpcChannel.add(2, 3)
            rpcChannel.log.notify('second')

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            await expect(addPromise).rejects.toBe(idError)
            expect(adapter.sendMessage).toHaveBeenCalledExactlyOnceWith({
                jsonrpc: '2.0',
                method: 'log',
                params: ['second'],
            })
            expect(connectedListener).toHaveBeenCalledWith()
        })

        it('should pause the queue if the connection is lost while sending and continue after reconnecting', async () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true, queueAwait: true })
            const connectedListener = vi.fn<() => void>()
            rpcChannel.$.on('rpc.connected', connectedListener)
            const addPromise = rpcChannel.add(2, 3)
            const subtractPromise = rpcChannel.subtract(5, 3)

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)
            adapter.triggerConnectionLost()

            await expect(addPromise).rejects.toThrowError(new RpcError(RpcErrorCode.CONNECTION_LOST))

            expect(adapter.sendMessage).toHaveBeenCalledTimes(1)
            expect(connectedListener).not.toHaveBeenCalled()

            adapter.sendMessage.mockImplementationOnce((message) => {
                void adapter.triggerMessageHandler({
                    jsonrpc: '2.0',
                    id: (message as RpcRequest<TestMethods>).id,
                    result: 2,
                })
            })
            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            await expect(subtractPromise).resolves.toBe(2)
            expect(connectedListener).toHaveBeenCalledTimes(1)
        })

        it('should emit rpc.connected only once if the connection is replaced while sending the queue', async () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true, queueAwait: true })
            const events: string[] = []
            rpcChannel.$.on('rpc.connected', () => events.push('connected'))
            rpcChannel.$.on('rpc.disconnected', () => events.push('disconnected'))
            const addPromise = rpcChannel.add(2, 3)
            const subtractPromise = rpcChannel.subtract(5, 3)

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)
            adapter.sendMessage.mockImplementationOnce((message) => {
                void adapter.triggerMessageHandler({
                    jsonrpc: '2.0',
                    id: (message as RpcRequest<TestMethods>).id,
                    result: 2,
                })
            })
            adapter.triggerConnectionLost()
            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            await expect(addPromise).rejects.toThrowError(new RpcError(RpcErrorCode.CONNECTION_LOST))
            await expect(subtractPromise).resolves.toBe(2)
            expect(events).toStrictEqual(['disconnected', 'connected'])
        })

        it('should emit rpc.connected after the queued messages were sent', () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter, { queueEnabled: true })
            const connectedListener = vi.fn<() => void>()
            rpcChannel.$.on('rpc.connected', connectedListener)
            rpcChannel.log.notify('queued')

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)

            expect(connectedListener).toHaveBeenCalledWith()
            expect(connectedListener.mock.invocationCallOrder[0]).toBeGreaterThan(
                adapter.sendMessage.mock.invocationCallOrder[0]!,
            )
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

        it.each([false, 0, ''])('should respond with the falsy result %j unchanged', async (result) => {
            const adapter = new MockAdapter<TestMethods, Record<string, () => unknown>>()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.$.handle('falsyEvent', () => result)
            await adapter.triggerMessageHandler(request('falsyEvent', []))

            expect(adapter.sendMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 'request-id', result })
        })

        it.each([
            ['a numeric id', 42],
            ['a null id', null],
        ])('should echo %s in the response', async (_, id) => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.$.handle('onEvent', () => true)
            await adapter.triggerMessageHandler({ jsonrpc: '2.0', id, method: 'onEvent', params: ['hi'] })

            expect(adapter.sendMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id, result: true })
        })

        it('should handle requests that arrive as JSON strings', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.$.handle('onEvent', () => true)
            await adapter.triggerMessageHandler(JSON.stringify(request('onEvent', ['hi'])))

            expect(adapter.sendMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 'request-id', result: true })
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

        it('should call on-listeners before the handler', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const handler = vi.fn<(message: string) => boolean>().mockReturnValue(true)
            const listener = vi.fn<(message: string) => void>()

            rpcChannel.$.handle('onEvent', handler)
            rpcChannel.$.on('onEvent', listener)
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(listener.mock.invocationCallOrder[0]).toBeLessThan(handler.mock.invocationCallOrder[0]!)
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

        it('should put thrown values that are no errors into the error data', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.$.handle('onEvent', () => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw 'oops'
            })
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(adapter.sendMessage).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 'request-id',
                error: {
                    code: RpcErrorCode.SERVER_ERROR,
                    message: RPC_ERROR_MESSAGE_MAP[RpcErrorCode.SERVER_ERROR],
                    data: 'oops',
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

    describe('handling invalid messages', () => {
        it('should respond with invalid request and the detected id', async () => {
            const adapter = new MockAdapter()
            createRpcChannel(adapter)

            await adapter.triggerMessageHandler({ jsonrpc: '2.0', id: 'request-id', method: 'onEvent', params: 'x' })

            expect(adapter.sendMessage).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 'request-id',
                error: {
                    code: RpcErrorCode.INVALID_REQUEST,
                    message: RPC_ERROR_MESSAGE_MAP[RpcErrorCode.INVALID_REQUEST],
                    data: { reason: '"params" must be an array or an object' },
                },
            })
        })

        it('should respond with invalid request and null id to invalid notifications', async () => {
            const adapter = new MockAdapter()
            createRpcChannel(adapter)

            await adapter.triggerMessageHandler({ jsonrpc: '2.0', method: 1, params: 'bar' })

            expect(adapter.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: null,
                    error: expect.objectContaining({ code: RpcErrorCode.INVALID_REQUEST }),
                }),
            )
        })

        it('should respond with a parse error and null id to invalid JSON', async () => {
            const adapter = new MockAdapter()
            createRpcChannel(adapter)

            await adapter.triggerMessageHandler('{ invalid json')

            expect(adapter.sendMessage).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: RpcErrorCode.PARSE_ERROR,
                    message: RPC_ERROR_MESSAGE_MAP[RpcErrorCode.PARSE_ERROR],
                    data: { reason: 'message is not valid JSON' },
                },
            })
        })

        it('should not respond to invalid response-like messages', async () => {
            const adapter = new MockAdapter()
            createRpcChannel(adapter)

            await adapter.triggerMessageHandler({ jsonrpc: '2.0', id: 'request-id', error: 'broken' })

            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should log a warning and emit rpc.error for invalid messages', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const errorListener = vi.fn<(error: RpcError) => void>()
            const invalidMessage = { jsonrpc: '1.0', id: 'request-id', method: 'onEvent' }

            rpcChannel.$.on('rpc.error', errorListener)
            await adapter.triggerMessageHandler(invalidMessage)

            expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({ code: RpcErrorCode.INVALID_REQUEST }))
            expect(console.warn).toHaveBeenCalledWith(
                '[RpcChannel]',
                'Received an invalid message: "jsonrpc" must be exactly "2.0"',
                invalidMessage,
            )
        })

        it('should log a warning and emit rpc.error for error responses with null id', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const errorListener = vi.fn<(error: RpcError) => void>()

            rpcChannel.$.on('rpc.error', errorListener)
            await adapter.triggerMessageHandler({
                jsonrpc: '2.0',
                id: null,
                error: { code: RpcErrorCode.PARSE_ERROR, message: 'Parse error' },
            })

            const [[error]] = errorListener.mock.calls as [[RpcError]]

            expect(error).toBeInstanceOf(RpcError)
            expect(error.code).toBe(RpcErrorCode.PARSE_ERROR)
            expect(console.warn).toHaveBeenCalledWith(
                '[RpcChannel]',
                'Received an error response that cannot be assigned to a request',
                error,
            )
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should respond with an internal error if the response cannot be sent', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const cloneError = new Error('() => undefined could not be cloned.')

            adapter.sendMessage.mockImplementationOnce(() => {
                throw cloneError
            })
            rpcChannel.$.handle('onEvent', () => true)
            await adapter.triggerMessageHandler(request('onEvent', ['hi']))

            expect(console.error).toHaveBeenCalledWith(
                '[RpcChannel]',
                'Could not send the response to "onEvent"',
                cloneError,
            )
            expect(adapter.sendMessage).toHaveBeenLastCalledWith({
                jsonrpc: '2.0',
                id: 'request-id',
                error: {
                    code: RpcErrorCode.INTERNAL_ERROR,
                    message: RPC_ERROR_MESSAGE_MAP[RpcErrorCode.INTERNAL_ERROR],
                    data: { message: cloneError.message, name: 'Error', stack: undefined },
                },
            })
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

        it('should emit rpc.status before rpc.connected and rpc.disconnected', () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const rpcChannel = createRpcChannel(adapter)
            const events: string[] = []
            rpcChannel.$.on('rpc.status', (status) => events.push(`status:${status}`))
            rpcChannel.$.on('rpc.connected', () => events.push('connected'))
            rpcChannel.$.on('rpc.disconnected', () => events.push('disconnected'))

            adapter.triggerConnectionHandler(ConnectionStatus.CONNECTED)
            adapter.triggerConnectionHandler(ConnectionStatus.DISCONNECTED)

            expect(events).toStrictEqual(['status:connected', 'connected', 'status:disconnected', 'disconnected'])
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

        it('should destroy the adapter only once', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)
            const destroySpy = vi.spyOn(adapter, 'destroy')

            rpcChannel.$.destroy()
            rpcChannel.$.destroy()

            expect(destroySpy).toHaveBeenCalledTimes(1)
        })

        it('should throw if the adapter is already used by another channel', () => {
            const adapter = new MockAdapter()
            createRpcChannel(adapter)

            expect(() => createRpcChannel(adapter)).toThrowError(
                'The adapter is already used by another channel. Create a separate adapter instance for each channel.',
            )
        })

        it('should allow a new channel on the adapter after the previous one was destroyed', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            rpcChannel.$.destroy()

            expect(() => createRpcChannel(adapter)).not.toThrowError()
        })
    })

    describe('adapter setup', () => {
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

        it('should initialize the logger of the adapter with the log level before connecting', () => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const initLoggerSpy = vi.spyOn(adapter, 'initLogger')

            createRpcChannel(adapter, { logLevel: LogLevel.WARN })

            expect(initLoggerSpy).toHaveBeenCalledWith(LogLevel.WARN)
            expect(initLoggerSpy.mock.invocationCallOrder[0]).toBeLessThan(adapter.connect.mock.invocationCallOrder[0]!)
        })

        it.each([
            [
                'throws',
                (error: Error) => {
                    throw error
                },
            ],
            ['rejects', (error: Error) => Promise.reject(error)],
        ])('should log an error if connect() of the adapter %s', async (_, failWith) => {
            const adapter = new MockAdapter(ConnectionStatus.DISCONNECTED)
            const connectError = new Error('connect failed')
            adapter.connect.mockImplementationOnce(() => failWith(connectError))

            expect(() => createRpcChannel(adapter)).not.toThrowError()

            await vi.waitFor(() =>
                expect(console.error).toHaveBeenCalledWith(
                    '[RpcChannel]',
                    'The adapter could not connect',
                    connectError,
                ),
            )
        })
    })

    describe('proxy', () => {
        it('should return object builtins without sending messages', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            expect(rpcChannel.toString()).toBe('[object Object]')
            expect(rpcChannel.valueOf()).toBe(rpcChannel)
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should not be treated as thenable', async () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            expect((rpcChannel as unknown as Record<string, unknown>).then).toBeUndefined()
            await expect(Promise.resolve(rpcChannel)).resolves.toBe(rpcChannel)
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should serialize to its status with JSON.stringify without sending messages', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            expect(JSON.stringify(rpcChannel)).toBe('{"$":{"status":"connected"}}')
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })

        it('should return undefined for unknown symbol properties', () => {
            const adapter = new MockAdapter()
            const rpcChannel = createRpcChannel(adapter)

            expect((rpcChannel as unknown as Record<symbol, unknown>)[Symbol.toPrimitive]).toBeUndefined()
            expect(adapter.sendMessage).not.toHaveBeenCalled()
        })
    })
})
