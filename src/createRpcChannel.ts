import {AbstractRpcAdapter} from "./lib/AbstractRpcAdapter";
import {EventEmitter} from "./lib/EventEmitter";
import {isRpcErrorResponse, parseRpcMessage, RpcMessageType} from "./utils/rpc";
import {RpcError} from "./lib/RpcError";
import {uuid} from "./utils/uuid";
import {RpcMessageBase, RpcRequest, RpcResponse} from "./types/RpcMessages";
import {RPC_ERROR_NAME_MAP, RpcErrorCode} from "./constants/JSON_RPC_ERRORS";
import {PublicEventEmitter} from "./types/EventEmitter";
import {MethodMap} from "./types/MethodMap";

export interface RPCChannelOptions {
    timeout: number
}

type QueueResolveFn = (resolveValue: any) => void

interface QueueEntry {
    resolve: QueueResolveFn,
    reject: QueueResolveFn,
}

type Queue = Record<string, QueueEntry>

const PUBLIC_EVENT_METHODS: string[] = ['addEventListener', 'removeEventListener'] satisfies (keyof PublicEventEmitter<any>)[]

export function createRPCChannel<
    Methods extends MethodMap,
    Events extends MethodMap
>(adapter: AbstractRpcAdapter<Methods, Events>, options: Partial<RPCChannelOptions> = {}) {
    options = Object.assign({timeout: 3000}, options)

    const events = new EventEmitter()
    const queue: Queue = {}

    adapter.setMessageHandler((data) => {
        const {type, message} = parseRpcMessage(data)

        if(type === RpcMessageType.RESPONSE) {
            return void handleResponse(message)
        }
        void handleRequest(message)
    })

    function handleResponse(message: RpcResponse) {
        if(isRpcErrorResponse(message)) {
            queue[message.id]?.reject(new RpcError(message.error))
            return
        }
        return void queue[message.id]?.resolve(message.result)
    }

    async function handleRequest(message: RpcRequest) {
        const responseBase: RpcMessageBase = {jsonrpc: '2.0', id: message.id}
        let response: RpcResponse

        try {
            const result = await events.dispatchEvent(message.method, message.params)
            response = {
                ...responseBase,
                result
            }
        } catch (err) {
            const error = new RpcError({
                code: RpcErrorCode.SERVER_ERROR,
                message: RPC_ERROR_NAME_MAP[RpcErrorCode.SERVER_ERROR],

                // TODO: improve error serialization & make error details configurable
                data: err
            })

            response = {
                ...responseBase,
                error
            }
        }

        void adapter.sendMessage(response)
    }

    function sendRequest(method: string, params: unknown[]): Promise<unknown> {
        const id = uuid()
        const request: RpcRequest = {
            id,
            method,
            params,
            jsonrpc: '2.0'
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new RpcError(RpcErrorCode.INVALID_REQUEST)), options.timeout)

            queue[id] = {
                resolve: value => {
                    clearTimeout(timeoutId)
                    resolve(value)
                },
                reject: err => {
                    clearTimeout(timeoutId)
                    reject(err)
                }
            }

            void adapter.sendMessage(request)
        }).finally(() => {
            delete queue[id]
        })
    }

    return new Proxy({}, {
        get(target, prop) {

            // Keep for builtins
            if(prop in target) {
                return target[prop as keyof typeof target]
            }

            if(PUBLIC_EVENT_METHODS.includes(prop.toString())) {
                return events[prop as keyof PublicEventEmitter<any>]
            }
            return (...params: unknown[]) => sendRequest(prop.toString(), params)
        }
    })
}
