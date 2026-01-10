import { AbstractRpcAdapter } from './lib/AbstractRpcAdapter'
import { EventEmitter } from './lib/EventEmitter'
import { isRpcErrorResponse, parseRpcMessage, RpcMessageType } from './utils/rpc'
import { RpcError } from './lib/RpcError'
import { uuid } from './utils/uuid'
import { RpcMessageBase, RpcRequest, RpcResponse } from './types/RpcMessages'
import { RPC_ERROR_NAME_MAP, RpcErrorCode } from './constants/JSON_RPC_ERRORS'
import { PublicEventEmitter } from './types/EventEmitter'
import { MethodMap } from './types/MethodMap'
import { RpcChannel, RpcChannelMeta } from '@/types/RpcChannel'
import {
    AnyRpcEvents,
    CONNECTED_EVENT,
    CONNECTION_CHANGE_EVENT,
    CONNECTION_CLOSED_EVENT,
} from '@/constants/DEFAULT_EVENTS'
import { ConnectionStatus } from '@/types/ConnectionStatus'

export interface RPCChannelOptions {
    timeout: number
}

type QueueResolveFn = (resolveValue: unknown) => void
type QueueRejectFn = (resolveValue: Error) => void

interface QueueEntry {
    resolve: QueueResolveFn
    reject: QueueRejectFn
}

type Queue = Record<string, QueueEntry>

const PUBLIC_EVENT_METHODS: string[] = [
    'addEventListener',
    'removeEventListener',
] satisfies (keyof PublicEventEmitter<never>)[]

export function createRpcChannel<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>>(
    adapter: AbstractRpcAdapter<Methods, Events>,
    options: Partial<RPCChannelOptions> = {},
) {
    options = Object.assign({ timeout: 3000 }, options)

    const events = new EventEmitter<Events>()
    const anyRpcEvents = new EventEmitter<AnyRpcEvents>()
    const queue: Queue = {}
    let currentStatus = ConnectionStatus.CLOSED

    adapter.messageHandler = async function rpcChannelMessageHandler(data) {
        const { type, message } = parseRpcMessage<Methods, Events>(data)

        if (type === RpcMessageType.RESPONSE) {
            handleResponse(message)
            return
        }
        await handleRequest(message)
    }

    adapter.connectionHandler = function rpcChannelConnectionHandler(status) {
        currentStatus = status
        void anyRpcEvents.dispatchEvent(CONNECTION_CHANGE_EVENT, [status])

        if (status === ConnectionStatus.CONNECTED) {
            void anyRpcEvents.dispatchEvent(CONNECTED_EVENT, [])
        } else {
            void anyRpcEvents.dispatchEvent(CONNECTION_CLOSED_EVENT, [])
        }
    }

    const meta: RpcChannelMeta = {
        get status() {
            return currentStatus
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

    function handleResponse(message: RpcResponse<Methods>): void {
        if (isRpcErrorResponse(message)) {
            queue[message.id]?.reject(new RpcError(message.error))
            return
        }
        queue[message.id]?.resolve(message.result)
    }

    async function handleRequest(message: RpcRequest<Events>): Promise<void> {
        const { result, error } = await events.dispatchEvent(message.method, message.params)
        const responseBase: RpcMessageBase = { jsonrpc: '2.0', id: message.id }
        let response: RpcResponse<Events>

        if (error) {
            const rpcError = new RpcError({
                code: RpcErrorCode.SERVER_ERROR,
                message: RPC_ERROR_NAME_MAP[RpcErrorCode.SERVER_ERROR],

                // TODO: improve error serialization & make error details configurable
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

        void adapter.sendMessage(response)
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
            const timeoutId = setTimeout(() => reject(new RpcError(RpcErrorCode.TIMEOUT_ERROR)), options.timeout)

            queue[id] = {
                resolve: (value) => {
                    clearTimeout(timeoutId)
                    resolve(value)
                },
                reject: (err: Error) => {
                    clearTimeout(timeoutId)
                    reject(err)
                },
            }

            void adapter.sendMessage(request)
        }).finally(() => {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete queue[id]
        })
    }

    return new Proxy<RpcChannel<Methods, Events>>({ $: meta } as unknown as RpcChannel<Methods, Events>, {
        get(target, prop) {
            // Keep for builtins
            if (prop in target) {
                return target[prop as keyof typeof target]
            }

            if (PUBLIC_EVENT_METHODS.includes(prop.toString())) {
                return events[prop as keyof PublicEventEmitter<Events>].bind(events)
            }
            return (...params: unknown[]) =>
                sendRequest(prop.toString() as keyof Methods, params as Parameters<Methods[keyof Methods]>)
        },
    })
}
