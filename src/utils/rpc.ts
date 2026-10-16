import { RpcError } from '@/lib/RpcError'
import { LOCAL_ERROR_CODES, RESERVED_ERROR_CODE_RANGE, RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import type { RpcErrorData, RpcErrorResponse, RpcIncomingRequest, RpcResponse } from '@/types/RpcMessages'
import type { MethodMap } from '@/types/MethodMap'

export const enum RpcMessageType {
    REQUEST,
    RESPONSE,
}

export interface RpcResponseParsingResult<Methods extends MethodMap<Methods>> {
    message: RpcResponse<Methods>
    type: RpcMessageType.RESPONSE
}

export interface RpcRequestParsingResult<Methods extends MethodMap<Methods>> {
    message: RpcIncomingRequest<Methods>
    type: RpcMessageType.REQUEST
}

export type RpcParsingResult<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> =
    | RpcResponseParsingResult<Methods>
    | RpcRequestParsingResult<Events>

const RESERVED_METHOD_PREFIX = 'rpc.'

export function parseRpcMessage<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>>(
    message: string | object,
): RpcParsingResult<Methods, Events> {
    const messageObj = toMessageObject(message)

    validateBaseMessage(messageObj)

    const isRequest = Object.hasOwn(messageObj, 'method')
    const isResponse = Object.hasOwn(messageObj, 'result') || Object.hasOwn(messageObj, 'error')

    if (isRequest && !isResponse) {
        return {
            type: RpcMessageType.REQUEST,
            message: parseRequestMessage<Events>(messageObj),
        }
    }

    if (isResponse && !isRequest) {
        validateResponseMessage(messageObj)

        return {
            type: RpcMessageType.RESPONSE,
            message: messageObj,
        }
    }

    throw new RpcError(RpcErrorCode.INVALID_REQUEST)
}

function toMessageObject(message: unknown): Record<string, unknown> {
    const messageValue = typeof message === 'string' ? parseJson(message) : message
    if (!isRecord(messageValue)) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
    return messageValue
}

function parseJson(message: string): unknown {
    try {
        return JSON.parse(message)
    } catch {
        throw new RpcError(RpcErrorCode.PARSE_ERROR)
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateBaseMessage(message: Record<string, unknown>): void {
    if (message.jsonrpc !== '2.0') {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
    if (Object.hasOwn(message, 'id')) {
        if (!(typeof message.id === 'string' || typeof message.id === 'number' || message.id === null)) {
            throw new RpcError(RpcErrorCode.INVALID_REQUEST)
        }
        if (typeof message.id === 'number' && !Number.isInteger(message.id)) {
            throw new RpcError(RpcErrorCode.INVALID_REQUEST)
        }
    }
}

function parseRequestMessage<Methods extends MethodMap<Methods>>(
    message: Record<string, unknown>,
): RpcIncomingRequest<Methods> {
    if (typeof message.method !== 'string') {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
    const params = Object.hasOwn(message, 'params') ? message.params : []
    if (!Array.isArray(params) && !isRecord(params)) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
    return { ...message, params } as RpcIncomingRequest<Methods>
}

function validateResponseMessage<Methods extends MethodMap<Methods>>(
    message: Record<string, unknown>,
): asserts message is RpcResponse<Methods> & Record<string, unknown> {
    if (!Object.hasOwn(message, 'id')) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
    if (!isRpcErrorResponse(message)) {
        return
    }
    if (Object.hasOwn(message, 'result')) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
    validateResponseError(message.error)
}

function validateResponseError(error: unknown): asserts error is RpcErrorData {
    if (!isRecord(error)) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
    if (!Number.isInteger(error.code)) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
    if (typeof error.message !== 'string') {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
}

export function isRpcErrorResponse(
    message: RpcResponse<MethodMap<never>, string> | object,
): message is RpcErrorResponse {
    return Object.hasOwn(message, 'error')
}

export function isReservedMethodName(method: PropertyKey): boolean {
    return typeof method === 'string' && method.startsWith(RESERVED_METHOD_PREFIX)
}

export function isApplicationErrorCode(code: number): boolean {
    const isReservedCode = code >= RESERVED_ERROR_CODE_RANGE.min && code <= RESERVED_ERROR_CODE_RANGE.max
    return !isReservedCode && !LOCAL_ERROR_CODES.includes(code)
}
