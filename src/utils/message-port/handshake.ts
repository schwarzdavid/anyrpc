import { parseRpcMessage, RpcMessageType, type RpcParsingResult } from '@/utils/rpc'
import type { RpcId, RpcSuccessResponse } from '@/types/RpcMessages'
import { uuid } from '@/utils/uuid'

export interface InitRequest {
    jsonrpc: '2.0'
    id: RpcId
    method: string
    params: [name: string]
}

export type InitResponse = RpcSuccessResponse<() => null>

type InitMethods = Record<string, (name: string) => unknown>

export function createInitRequest(method: string, name: string): InitRequest {
    return { jsonrpc: '2.0', id: uuid(), method, params: [name] }
}

export function isInitRequest(data: unknown, method: string, name: string): data is InitRequest {
    if (!hasFieldValue(data, 'method', method)) {
        return false
    }
    const parsingResult = tryParseRpcMessage(data)

    if (parsingResult?.type !== RpcMessageType.REQUEST) {
        return false
    }
    const { params } = parsingResult.message
    return Array.isArray(params) && params[0] === name
}

export function createInitResponse(request: InitRequest): InitResponse {
    return { jsonrpc: '2.0', id: request.id, result: null }
}

export function isInitResponse(data: unknown, requestId: RpcId): data is InitResponse {
    if (!hasFieldValue(data, 'id', requestId)) {
        return false
    }
    const parsingResult = tryParseRpcMessage(data)

    return (
        parsingResult?.type === RpcMessageType.RESPONSE &&
        'result' in parsingResult.message &&
        parsingResult.message.result === null
    )
}

function hasFieldValue(data: unknown, field: string, value: unknown): data is object {
    return typeof data === 'object' && data !== null && (data as Record<string, unknown>)[field] === value
}

function tryParseRpcMessage(data: object): RpcParsingResult<InitMethods, InitMethods> | undefined {
    try {
        return parseRpcMessage(data)
    } catch {
        return undefined
    }
}
