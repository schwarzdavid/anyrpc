export const ControlMethod = {
    PING: 'anyrpc::ping',
    PONG: 'anyrpc::pong',
    GOODBYE: 'anyrpc::goodbye',
} as const

export type ControlMethod = (typeof ControlMethod)[keyof typeof ControlMethod]

export interface ControlMessage {
    jsonrpc: '2.0'
    method: ControlMethod
    params: []
}

const CONTROL_METHODS: readonly unknown[] = Object.values(ControlMethod)

export function createControlMessage(method: ControlMethod): ControlMessage {
    return { jsonrpc: '2.0', method, params: [] }
}

export function readControlMethod(data: unknown): ControlMethod | undefined {
    if (typeof data !== 'object' || data === null || !('method' in data)) {
        return undefined
    }
    return isControlMethod(data.method) ? data.method : undefined
}

function isControlMethod(method: unknown): method is ControlMethod {
    return CONTROL_METHODS.includes(method)
}
