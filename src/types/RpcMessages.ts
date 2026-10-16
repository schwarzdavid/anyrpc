/* eslint-disable @typescript-eslint/no-explicit-any */

import type { MethodFn, MethodMap } from '@/types/MethodMap'

export type RpcId = string | number | null

export interface RpcMessageBase {
    jsonrpc: '2.0'
    id: RpcId
}

export interface RpcSuccessResponse<Fn extends MethodFn> extends RpcMessageBase {
    result: Awaited<ReturnType<Fn>> | null
}

export interface RpcErrorData {
    code: number
    message: string
    data?: any
}

export interface RpcErrorResponse extends RpcMessageBase {
    error: RpcErrorData
}

export interface RpcNotification<Methods extends MethodMap<Methods>, Name extends keyof Methods = keyof Methods> {
    jsonrpc: '2.0'
    method: Name
    params: Parameters<Methods[Name]>
}

export interface RpcRequest<
    Methods extends MethodMap<Methods>,
    Name extends keyof Methods = keyof Methods,
> extends RpcNotification<Methods, Name> {
    id: string
}

export type RpcNamedParams = Record<string, unknown>

export interface RpcIncomingNotification<
    Methods extends MethodMap<Methods>,
    Name extends keyof Methods = keyof Methods,
> {
    jsonrpc: '2.0'
    method: Name
    params: Parameters<Methods[Name]> | RpcNamedParams
}

export interface RpcIncomingRequest<
    Methods extends MethodMap<Methods>,
    Name extends keyof Methods = keyof Methods,
> extends RpcIncomingNotification<Methods, Name> {
    id: RpcId
}

export type RpcResponse<Methods extends MethodMap<Methods>, Name extends keyof Methods = keyof Methods> =
    | RpcSuccessResponse<Methods[Name]>
    | RpcErrorResponse

export type RpcMessage<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> =
    | RpcRequest<Methods>
    | RpcNotification<Methods>
    | RpcResponse<Events>
