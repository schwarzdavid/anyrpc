export const RpcErrorCode = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    SERVER_ERROR: -32000,
    TIMEOUT_ERROR: -31001,
    NOT_CONNECTED: -31002,
    CONNECTION_LOST: -31003,
} as const

export type RpcErrorCode = (typeof RpcErrorCode)[keyof typeof RpcErrorCode]

export const RESERVED_ERROR_CODE_RANGE = { min: -32768, max: -32000 } as const

export const LOCAL_ERROR_CODES: readonly number[] = [
    RpcErrorCode.TIMEOUT_ERROR,
    RpcErrorCode.NOT_CONNECTED,
    RpcErrorCode.CONNECTION_LOST,
]

export const RPC_ERROR_MESSAGE_MAP: Record<RpcErrorCode, string> = {
    [RpcErrorCode.PARSE_ERROR]: 'Parse error',
    [RpcErrorCode.INVALID_REQUEST]: 'Invalid Request',
    [RpcErrorCode.METHOD_NOT_FOUND]: 'Method not found',
    [RpcErrorCode.INVALID_PARAMS]: 'Invalid params',
    [RpcErrorCode.INTERNAL_ERROR]: 'Internal error',
    [RpcErrorCode.SERVER_ERROR]: 'Server error',
    [RpcErrorCode.TIMEOUT_ERROR]: 'No response received within the configured timeout',
    [RpcErrorCode.NOT_CONNECTED]: 'No connection has been established yet',
    [RpcErrorCode.CONNECTION_LOST]: 'The connection was closed before a response was received',
}
