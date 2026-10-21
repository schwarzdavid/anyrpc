import type { InitResponse } from '@/lib/adapter/message-port/utils/handshake'
import type { MessagePortLike } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'

export interface InitEnvelope {
    response: InitResponse
    ports: MessagePortLike[]
}

export interface ReceivedInitEnvelope {
    response: unknown
    ports: MessagePortLike[]
}

const MESSAGE_PORT_METHODS: readonly (keyof MessagePortLike)[] = ['postMessage', 'addEventListener', 'start', 'close']

export function createInitEnvelope(response: InitResponse, ports: MessagePortLike[]): InitEnvelope {
    return { response, ports }
}

export function readInitEnvelope(value: unknown): ReceivedInitEnvelope | undefined {
    if (typeof value !== 'object' || value === null || !('response' in value) || !('ports' in value)) {
        return undefined
    }
    const { response, ports } = value

    if (!Array.isArray(ports) || !ports.every(isMessagePortLike)) {
        return undefined
    }
    return { response, ports }
}

function isMessagePortLike(value: unknown): value is MessagePortLike {
    return (
        typeof value === 'object' &&
        value !== null &&
        MESSAGE_PORT_METHODS.every((method) => typeof Reflect.get(value, method) === 'function')
    )
}
