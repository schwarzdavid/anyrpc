import { AbstractRpcAdapter } from './lib/AbstractRpcAdapter'
import { EventEmitter } from './lib/EventEmitter'
import { isRpcErrorResponse, parseRpcMessage, RpcMessageType } from './utils/rpc'
import { RpcError } from './lib/RpcError'
import { uuid } from './utils/uuid'
import type { RpcMessageBase, RpcRequest, RpcResponse } from './types/RpcMessages'
import { RPC_ERROR_NAME_MAP, RpcErrorCode } from './constants/JSON_RPC_ERRORS'
import type { PublicEventEmitter } from './types/EventEmitter'
import type { MethodMap } from './types/MethodMap'
import type { RpcChannel, RpcChannelMeta } from '@/types/RpcChannel'
import {
    type AnyRpcEvents,
    CONNECTED_EVENT,
    CONNECTION_CHANGE_EVENT,
    CONNECTION_CLOSED_EVENT,
} from '@/constants/DEFAULT_EVENTS'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { Logger } from '@/lib/Logger'
import { LogLevel } from '@/types/LogLevel'

export interface RpcChannelOptions {
    timeout: number
    queueEnabled: boolean
    queueTimeout: number
    queueAwait: boolean
    errorIncludeStack: boolean
    logLevel: LogLevel
    autoConnect: boolean
}

type MessageResolveFn = (resolveValue: unknown) => void
type MessageRejectFn = (resolveValue: Error) => void

interface PendingMessage {
    resolve: MessageResolveFn
    reject: MessageRejectFn
}

type QueuedRequest<Methods extends MethodMap<Methods>> = Omit<RpcRequest<Methods>, 'jsonrpc'>

interface QueuedMessage<Methods extends MethodMap<Methods>> extends PendingMessage {
    request: QueuedRequest<Methods>
}

type PendingMessageRegistry = Record<string, PendingMessage>

const PUBLIC_EVENT_METHODS: string[] = [
    'addEventListener',
    'removeEventListener',
] satisfies (keyof PublicEventEmitter<never>)[]

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
        } satisfies RpcChannelOptions,
        options,
    )

    const logger = new Logger('RpcChannel', mergedOptions.logLevel)
    const events = new EventEmitter<Events>()
    const anyRpcEvents = new EventEmitter<AnyRpcEvents>()
    const pendingMessageRegistry: PendingMessageRegistry = {}
    const queuedMessages: QueuedMessage<Methods>[] = []

    const meta: RpcChannelMeta = {
        get status() {
            return adapter.connectionStatus
        },
        get addEventListener() {
            return anyRpcEvents.addEventListener.bind(anyRpcEvents)
        },
        get removeEventListener() {
            return anyRpcEvents.removeEventListener.bind(anyRpcEvents)
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
        await handleRequest(message)
    }

    adapter.connectionHandler = async function rpcChannelConnectionHandler(status) {
        logger.debug(`Connection status changed to ${status}`)

        void anyRpcEvents.dispatchEvent(CONNECTION_CHANGE_EVENT, [status])

        if (status === ConnectionStatus.CONNECTED) {
            await processQueuedMessages()
            void anyRpcEvents.dispatchEvent(CONNECTED_EVENT, [])
        } else {
            void anyRpcEvents.dispatchEvent(CONNECTION_CLOSED_EVENT, [])
        }
    }

    if (mergedOptions.autoConnect) {
        adapter.connect()
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

    async function handleRequest(message: RpcRequest<Events>): Promise<void> {
        const { result, error } = await events.dispatchEvent(message.method, message.params)
        const responseBase: RpcMessageBase = { jsonrpc: '2.0', id: message.id }
        let response: RpcResponse<Events>

        if (error) {
            const rpcError = new RpcError({
                code: RpcErrorCode.SERVER_ERROR,
                message: RPC_ERROR_NAME_MAP[RpcErrorCode.SERVER_ERROR],
                data: error,
            })

            response = {
                ...responseBase,
                error: rpcError.toJSON(),
            }
        } else {
            response = {
                ...responseBase,
                result,
            }
        }

        adapter.sendMessage(response)
    }

    function processMessageRequest<Method extends keyof Methods>(
        method: Method,
        params: Parameters<Methods[Method]>,
    ): Promise<unknown> {
        if (adapter.connectionStatus === ConnectionStatus.CONNECTED) {
            return sendRequest(method, params)
        }
        if (mergedOptions.queueEnabled) {
            return addRequestToConnectionQueue(method, params)
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

    function addRequestToConnectionQueue<Method extends keyof Methods>(
        method: Method,
        params: Parameters<Methods[Method]>,
    ): Promise<unknown> {
        const id = uuid()
        const request: QueuedRequest<Methods> = {
            id,
            method,
            params,
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(
                () => reject(new RpcError(RpcErrorCode.TIMEOUT_ERROR)),
                mergedOptions.queueTimeout,
            )

            queuedMessages.push({
                request,
                resolve(value) {
                    clearTimeout(timeoutId)
                    resolve(value)
                },
                reject(err) {
                    clearTimeout(timeoutId)
                    reject(err)
                },
            })
        }).finally(() => {
            const queuedMessageIndex = queuedMessages.findIndex((queuedMessage) => queuedMessage.request.id === id)
            if (queuedMessageIndex >= 0) {
                queuedMessages.splice(queuedMessageIndex, 1)
            }
        })
    }

    async function processQueuedMessages(): Promise<void> {
        while (true) {
            const queuedMessage = queuedMessages.shift()
            if (!queuedMessage) {
                break
            }

            const promise = sendRequest(queuedMessage.request.method, queuedMessage.request.params)
                .then(queuedMessage.resolve)
                .catch(queuedMessage.reject)

            if (mergedOptions.queueAwait) {
                await promise
            }
        }
    }

    return new Proxy<RpcChannel<Methods, Events>>({ $: meta } as unknown as RpcChannel<Methods, Events>, {
        get(target, prop) {
            if (prop in target) {
                return target[prop as keyof typeof target]
            }

            if (PUBLIC_EVENT_METHODS.includes(prop.toString())) {
                return events[prop as keyof PublicEventEmitter<Events>].bind(events)
            }
            return (...params: unknown[]) =>
                processMessageRequest(prop.toString() as keyof Methods, params as Parameters<Methods[keyof Methods]>)
        },
    })
}
