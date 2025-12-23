/* eslint-disable @typescript-eslint/no-explicit-any */

import { MethodFn, MethodMap } from '@/types/MethodMap'

export interface RpcMessageBase {
    jsonrpc: '2.0'
    id: string
}

export interface RpcSuccessResponse<Fn extends MethodFn> extends RpcMessageBase {
    result: Awaited<ReturnType<Fn>> | undefined
}

export interface RpcErrorData {
    code: number
    message: string
    data?: any
}

export interface RpcErrorResponse extends RpcMessageBase {
    error: RpcErrorData
}

export interface RpcRequest<
    Methods extends MethodMap<Methods>,
    Name extends keyof Methods = keyof Methods,
> extends RpcMessageBase {
    method: Name
    params: Parameters<Methods[Name]>
}

export type RpcResponse<Methods extends MethodMap<Methods>, Name extends keyof Methods = keyof Methods> =
    | RpcSuccessResponse<Methods[Name]>
    | RpcErrorResponse

export type RpcMessage<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> =
    | RpcRequest<Methods>
    | RpcResponse<Events>
