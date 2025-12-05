export const enum RpcErrorCode {
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
    SERVER_ERROR = -32000,
    TIMEOUT_ERROR = -32001,
}

export const RPC_ERROR_NAME_MAP: Record<RpcErrorCode, string> = {
    [RpcErrorCode.PARSE_ERROR]: 'Parse error',
    [RpcErrorCode.INVALID_REQUEST]: 'Invalid Request',
    [RpcErrorCode.METHOD_NOT_FOUND]: 'Method not found',
    [RpcErrorCode.INVALID_PARAMS]: 'Invalid method parameter(s).',
    [RpcErrorCode.INTERNAL_ERROR]: 'Internal JSON-RPC error.',
    [RpcErrorCode.SERVER_ERROR]: 'Server error',
    [RpcErrorCode.TIMEOUT_ERROR]: 'Timeout',
}

export const RPC_ERROR_MESSAGE_MAP: Record<RpcErrorCode, string> = {
    [RpcErrorCode.PARSE_ERROR]:
        'Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.',
    [RpcErrorCode.INVALID_REQUEST]: 'The JSON sent is not a valid Request object.',
    [RpcErrorCode.METHOD_NOT_FOUND]: 'The method does not exist / is not available.',
    [RpcErrorCode.INVALID_PARAMS]: 'Invalid method parameter(s).',
    [RpcErrorCode.INTERNAL_ERROR]: 'Internal JSON-RPC error.',
    [RpcErrorCode.SERVER_ERROR]: '',
    [RpcErrorCode.TIMEOUT_ERROR]: 'No response within specified timeout.',
}
