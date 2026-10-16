import { RpcMessageError } from '@/lib/RpcMessageError'
import { LOCAL_ERROR_CODES, RESERVED_ERROR_CODE_RANGE, RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import type {
    RpcErrorData,
    RpcErrorResponse,
    RpcId,
    RpcIncomingNotification,
    RpcIncomingRequest,
    RpcResponse,
} from '@/types/RpcMessages'
import type { MethodMap } from '@/types/MethodMap'

export const enum RpcMessageType {
    REQUEST,
    NOTIFICATION,
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

export interface RpcNotificationParsingResult<Methods extends MethodMap<Methods>> {
    message: RpcIncomingNotification<Methods>
    type: RpcMessageType.NOTIFICATION
}

export type RpcParsingResult<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> =
    | RpcResponseParsingResult<Methods>
    | RpcRequestParsingResult<Events>
    | RpcNotificationParsingResult<Events>

type FailValidation = (reason: string) => never

const RESERVED_METHOD_PREFIX = 'rpc.'

export function parseRpcMessage<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>>(
    message: string | object,
): RpcParsingResult<Methods, Events> {
    const messageValue = typeof message === 'string' ? parseJson(message) : message
    const fail: FailValidation = (reason) => {
        throw new RpcMessageError(RpcErrorCode.INVALID_REQUEST, {
            reason,
            requestId: detectRequestId(messageValue),
            isResponse: isResponseLike(messageValue),
        })
    }

    if (Array.isArray(messageValue)) {
        fail('batch requests are not supported')
    }
    if (!isRecord(messageValue)) {
        fail('message must be a JSON object')
    }

    validateBaseMessage(messageValue, fail)

    const hasMethod = Object.hasOwn(messageValue, 'method')
    const isResponse = isResponseLike(messageValue)

    if (hasMethod && isResponse) {
        fail('message must not contain "method" together with "result" or "error"')
    }
    if (hasMethod) {
        const callMessage = parseCallMessage<Events>(messageValue, fail)

        if (Object.hasOwn(callMessage, 'id')) {
            return { type: RpcMessageType.REQUEST, message: callMessage as RpcIncomingRequest<Events> }
        }
        return { type: RpcMessageType.NOTIFICATION, message: callMessage }
    }
    if (isResponse) {
        validateResponseMessage<Methods>(messageValue, fail)

        return { type: RpcMessageType.RESPONSE, message: messageValue }
    }
    return fail('message must contain either "method" or "result"/"error"')
}

function parseJson(message: string): unknown {
    try {
        return JSON.parse(message)
    } catch {
        throw new RpcMessageError(RpcErrorCode.PARSE_ERROR, {
            reason: 'message is not valid JSON',
            requestId: null,
            isResponse: false,
        })
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidId(id: unknown): id is RpcId {
    return typeof id === 'string' || id === null || Number.isInteger(id)
}

function detectRequestId(message: unknown): RpcId {
    return isRecord(message) && isValidId(message.id) ? message.id : null
}

function isResponseLike(message: unknown): boolean {
    return isRecord(message) && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))
}

function validateBaseMessage(message: Record<string, unknown>, fail: FailValidation): void {
    if (message.jsonrpc !== '2.0') {
        fail('"jsonrpc" must be exactly "2.0"')
    }
    if (Object.hasOwn(message, 'id') && !isValidId(message.id)) {
        fail('"id" must be a string, an integer or null')
    }
}

function parseCallMessage<Methods extends MethodMap<Methods>>(
    message: Record<string, unknown>,
    fail: FailValidation,
): RpcIncomingNotification<Methods> {
    if (typeof message.method !== 'string') {
        fail('"method" must be a string')
    }
    const params = Object.hasOwn(message, 'params') ? message.params : []
    if (!Array.isArray(params) && !isRecord(params)) {
        fail('"params" must be an array or an object')
    }
    return { ...message, params } as RpcIncomingNotification<Methods>
}

function validateResponseMessage<Methods extends MethodMap<Methods>>(
    message: Record<string, unknown>,
    fail: FailValidation,
): asserts message is RpcResponse<Methods> & Record<string, unknown> {
    if (!Object.hasOwn(message, 'id')) {
        fail('responses must contain an "id"')
    }
    if (!isRpcErrorResponse(message)) {
        return
    }
    if (Object.hasOwn(message, 'result')) {
        fail('responses must not contain both "result" and "error"')
    }
    validateResponseError(message.error, fail)
}

function validateResponseError(error: unknown, fail: FailValidation): asserts error is RpcErrorData {
    if (!isRecord(error)) {
        fail('"error" must be an object')
    }
    if (!Number.isInteger(error.code)) {
        fail('"error.code" must be an integer')
    }
    if (typeof error.message !== 'string') {
        fail('"error.message" must be a string')
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
