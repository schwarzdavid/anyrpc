export interface RpcMessageBase {
    jsonrpc: '2.0',
    id: string
}

export interface RpcSuccessResponse extends RpcMessageBase{
    result: any
}

export interface RpcErrorData {
    code: number,
    message: string,
    data?: any
}

export interface RpcErrorResponse extends RpcMessageBase{
    error: RpcErrorData
}

export interface RpcRequest extends RpcMessageBase {
    method: string,
    params?: any,
}

export type RpcResponse = RpcSuccessResponse | RpcErrorResponse

export type RpcMessage = RpcRequest | RpcResponse
