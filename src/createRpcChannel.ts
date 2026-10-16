import { AbstractRpcAdapter } from './lib/AbstractRpcAdapter'
import { EventEmitter } from './lib/EventEmitter'
import { HandlerRegistry } from './lib/HandlerRegistry'
import {
    isApplicationErrorCode,
    isReservedMethodName,
    isRpcErrorResponse,
    parseRpcMessage,
    RpcMessageType,
} from './utils/rpc'
import { RpcError } from './lib/RpcError'
import { uuid } from './utils/uuid'
import type {
    RpcErrorResponse,
    RpcIncomingNotification,
    RpcIncomingRequest,
    RpcRequest,
    RpcResponse,
} from './types/RpcMessages'
import { RPC_ERROR_MESSAGE_MAP, RpcErrorCode } from './constants/JSON_RPC_ERRORS'
import type { MethodFn, MethodMap } from './types/MethodMap'
import type { RpcListener } from './types/EventEmitter'
import type { RpcConnectionEvents } from './types/RpcConnectionEvents'
import type { RpcChannel, RpcChannelMeta, RpcHandleableName } from '@/types/RpcChannel'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { Logger } from '@/lib/Logger'
import { LogLevel } from '@/types/LogLevel'

export type UnhandledRequestStrategy = 'reject' | 'observe'

export interface RpcChannelOptions {
    timeout: number
    queueEnabled: boolean
    queueTimeout: number
    queueAwait: boolean
    errorIncludeStack: boolean
    logLevel: LogLevel
    autoConnect: boolean
    unhandledRequests: UnhandledRequestStrategy
}

interface PendingMessage {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

type PendingMessageRegistry = Record<string, PendingMessage>

interface QueuedMessage {
    send(): Promise<void>
}

const THENABLE_PROPERTY = 'then'

export function createRpcChannel<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>>(
    adapter: AbstractRpcAdapter<Methods, Events>,
    options: Partial<RpcChannelOptions> = {},
) {
    const mergedOptions = Object.assign<RpcChannelOptions, Partial<RpcChannelOptions>>(
        {
            timeout: 3000,
            queueEnabled: false,
            queueTimeout: 10000,
            queueAwait: false,
            errorIncludeStack: false,
            logLevel: LogLevel.INFO,
            autoConnect: true,
            unhandledRequests: 'reject',
        } satisfies RpcChannelOptions,
        options,
    )

    const logger = new Logger('RpcChannel', mergedOptions.logLevel)
    const reportListenerError = (error: unknown, name: PropertyKey) => {
        logger.error(`Listener for "${String(name)}" threw an error`, error)
    }
    const callEvents = new EventEmitter<Events>(reportListenerError)
    const connectionEvents = new EventEmitter<RpcConnectionEvents>(reportListenerError)
    const handlers = new HandlerRegistry<Events>()
    const pendingMessageRegistry: PendingMessageRegistry = {}
    const queuedMessages: QueuedMessage[] = []

    const meta: RpcChannelMeta<Events> = {
        get status() {
            return adapter.connectionStatus
        },
        handle(name, handler) {
            assertNotReserved(name, 'handle')
            return handlers.register(name, handler)
        },
        on(name, listener) {
            const untypedListener = listener as RpcListener<MethodFn>
            if (isConnectionEventName(name)) {
                return connectionEvents.on(name, untypedListener)
            }
            return callEvents.on(name as RpcHandleableName<Events>, untypedListener)
        },
        destroy() {
            adapter.destroy()
        },
    }

    adapter.initLogger(mergedOptions.logLevel)

    adapter.messageHandler = async function rpcChannelMessageHandler(data) {
        const { type, message } = parseRpcMessage<Methods, Events>(data)

        if (type === RpcMessageType.RESPONSE) {
            handleResponse(message)
            return
        }
        if (type === RpcMessageType.REQUEST) {
            await handleRequest(message)
            return
        }
        await handleNotification(message)
    }

    adapter.connectionHandler = async function rpcChannelConnectionHandler(status) {
        logger.debug(`Connection status changed to ${status}`)

        connectionEvents.emit('rpc.status', [status])

        if (status === ConnectionStatus.CONNECTED) {
            await processQueuedMessages()
            connectionEvents.emit('rpc.connected', [])
        } else {
            connectionEvents.emit('rpc.disconnected', [])
        }
    }

    if (mergedOptions.autoConnect) {
        adapter.connect()
    }

    function assertNotReserved(name: PropertyKey, action: 'call' | 'notify' | 'handle'): void {
        if (isReservedMethodName(name)) {
            throw new Error(
                `Cannot ${action} "${String(name)}": method names starting with "rpc." are reserved by JSON-RPC 2.0`,
            )
        }
    }

    function isConnectionEventName(name: PropertyKey): name is keyof RpcConnectionEvents {
        return isReservedMethodName(name)
    }

    function handleResponse(message: RpcResponse<Methods>): void {
        if (isRpcErrorResponse(message)) {
            logger.debug('Received error response', message)
            pendingMessageRegistry[message.id]?.reject(new RpcError(message.error))
            return
        }
        logger.debug('Received successful response', message)
        pendingMessageRegistry[message.id]?.resolve(message.result)
    }

    async function handleRequest(request: RpcIncomingRequest<Events>): Promise<void> {
        adapter.sendMessage(await createResponse(request))
    }

    async function createResponse(request: RpcIncomingRequest<Events>): Promise<RpcResponse<Events>> {
        if (isReservedMethodName(request.method)) {
            return createErrorResponse(request, new RpcError(RpcErrorCode.METHOD_NOT_FOUND))
        }
        const handler = handlers.get(request.method)
        if (!handler && mergedOptions.unhandledRequests === 'reject') {
            return createErrorResponse(request, new RpcError(RpcErrorCode.METHOD_NOT_FOUND))
        }
        if (!Array.isArray(request.params)) {
            return createErrorResponse(request, new RpcError(RpcErrorCode.INVALID_PARAMS))
        }

        callEvents.emit(request.method, request.params)

        if (!handler) {
            return createErrorResponse(request, new RpcError(RpcErrorCode.METHOD_NOT_FOUND))
        }
        try {
            const result = await handler(...request.params)
            return { jsonrpc: '2.0', id: request.id, result: result ?? null }
        } catch (error) {
            return createErrorResponse(request, toResponseError(error))
        }
    }

    function createErrorResponse(request: RpcIncomingRequest<Events>, error: RpcError): RpcErrorResponse {
        return { jsonrpc: '2.0', id: request.id, error: error.toJSON() }
    }

    function toResponseError(error: unknown): RpcError {
        if (error instanceof RpcError && isApplicationErrorCode(error.code)) {
            return error
        }
        return new RpcError(
            {
                code: RpcErrorCode.SERVER_ERROR,
                message: RPC_ERROR_MESSAGE_MAP[RpcErrorCode.SERVER_ERROR],
                data: error,
            },
            mergedOptions.errorIncludeStack,
        )
    }

    async function handleNotification(notification: RpcIncomingNotification<Events>): Promise<void> {
        const method = String(notification.method)

        if (isReservedMethodName(notification.method)) {
            logger.debug(`Ignoring notification "${method}": method names starting with "rpc." are reserved`)
            return
        }
        if (!Array.isArray(notification.params)) {
            logger.warn(`Ignoring notification "${method}": named params are not supported`)
            return
        }

        callEvents.emit(notification.method, notification.params)

        try {
            await handlers.get(notification.method)?.(...notification.params)
        } catch (error) {
            logger.error(`Handler for notification "${method}" threw an error`, error)
        }
    }

    function callRemoteMethod<Method extends keyof Methods>(
        method: Method,
        params: Parameters<Methods[Method]>,
    ): Promise<unknown> {
        assertNotReserved(method, 'call')

        if (adapter.connectionStatus === ConnectionStatus.CONNECTED) {
            return sendRequest(method, params)
        }
        if (mergedOptions.queueEnabled) {
            return enqueueRequest(method, params)
        }
        throw new RpcError(RpcErrorCode.NOT_CONNECTED)
    }

    function notifyRemoteMethod<Method extends keyof Methods>(
        method: Method,
        params: Parameters<Methods[Method]>,
    ): void {
        assertNotReserved(method, 'notify')

        if (adapter.connectionStatus === ConnectionStatus.CONNECTED) {
            sendNotification(method, params)
            return
        }
        if (mergedOptions.queueEnabled) {
            enqueueNotification(method, params)
            return
        }
        throw new RpcError(RpcErrorCode.NOT_CONNECTED)
    }

    function sendRequest<Method extends keyof Methods>(
        method: Method,
        params: Parameters<Methods[Method]>,
    ): Promise<unknown> {
        const id = uuid()
        const request: RpcRequest<Methods> = {
            id,
            method,
            params,
            jsonrpc: '2.0',
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new RpcError(RpcErrorCode.TIMEOUT_ERROR)), mergedOptions.timeout)

            pendingMessageRegistry[id] = {
                resolve: (value) => {
                    clearTimeout(timeoutId)
                    resolve(value)
                },
                reject: (err: Error) => {
                    clearTimeout(timeoutId)
                    reject(err)
                },
            }

            adapter.sendMessage(request)
        }).finally(() => {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete pendingMessageRegistry[id]
        })
    }

    function sendNotification<Method extends keyof Methods>(method: Method, params: Parameters<Methods[Method]>): void {
        adapter.sendMessage({ jsonrpc: '2.0', method, params })
    }

    function enqueueRequest<Method extends keyof Methods>(
        method: Method,
        params: Parameters<Methods[Method]>,
    ): Promise<unknown> {
        return new Promise((resolve, reject) => {
            enqueue(
                () => sendRequest(method, params).then(resolve, reject),
                () => reject(new RpcError(RpcErrorCode.TIMEOUT_ERROR)),
            )
        })
    }

    function enqueueNotification<Method extends keyof Methods>(
        method: Method,
        params: Parameters<Methods[Method]>,
    ): void {
        enqueue(
            () => {
                sendNotification(method, params)
                return Promise.resolve()
            },
            () => logger.warn(`Dropped notification "${String(method)}": no connection within queueTimeout`),
        )
    }

    function enqueue(send: () => Promise<void>, onExpire: () => void): void {
        const queuedMessage: QueuedMessage = {
            send() {
                clearTimeout(timeoutId)
                return send()
            },
        }
        const timeoutId = setTimeout(() => {
            queuedMessages.splice(queuedMessages.indexOf(queuedMessage), 1)
            onExpire()
        }, mergedOptions.queueTimeout)

        queuedMessages.push(queuedMessage)
    }

    async function processQueuedMessages(): Promise<void> {
        while (true) {
            const queuedMessage = queuedMessages.shift()
            if (!queuedMessage) {
                break
            }

            const sending = queuedMessage.send()

            if (mergedOptions.queueAwait) {
                await sending
            }
        }
    }

    function createRemoteMethod(method: keyof Methods) {
        const call = (...params: unknown[]) => callRemoteMethod(method, params as Parameters<Methods[typeof method]>)
        const notify = (...params: unknown[]) => {
            notifyRemoteMethod(method, params as Parameters<Methods[typeof method]>)
        }
        return Object.assign(call, { notify })
    }

    return new Proxy<RpcChannel<Methods, Events>>({ $: meta } as unknown as RpcChannel<Methods, Events>, {
        get(target, prop) {
            if (prop in target) {
                return target[prop as keyof typeof target]
            }
            if (typeof prop === 'symbol' || prop === THENABLE_PROPERTY) {
                return undefined
            }
            return createRemoteMethod(prop as keyof Methods)
        },
    })
}
