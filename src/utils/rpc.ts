import { RpcError } from '@/lib/RpcError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { RpcErrorData, RpcErrorResponse, RpcRequest, RpcResponse } from '@/types/RpcMessages'
import { MethodMap } from '@/types/MethodMap'

export const enum RpcMessageType {
    REQUEST,
    RESPONSE,
}

export interface RpcResponseParsingResult<Methods extends MethodMap<Methods>> {
    message: RpcResponse<Methods>
    type: RpcMessageType.RESPONSE
}

export interface RpcRequestParsingResult<Methods extends MethodMap<Methods>> {
    message: RpcRequest<Methods>
    type: RpcMessageType.REQUEST
}

export type RpcParsingResult<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> =
    | RpcResponseParsingResult<Methods>
    | RpcRequestParsingResult<Events>

export function parseRpcMessage<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>>(
    message: string | object,
): RpcParsingResult<Methods, Events> {
    let messageObj: Record<string, unknown>
    if (typeof message === 'string') {
        try {
            messageObj = JSON.parse(message)
        } catch (err) {
            throw new RpcError(RpcErrorCode.PARSE_ERROR)
        }
    } else {
        messageObj = message as Record<string, unknown>
    }

    validateBaseMessage(messageObj)

    const isRequest = Object.hasOwn(messageObj, 'method')
    const isResponse = Object.hasOwn(messageObj, 'result') || Object.hasOwn(messageObj, 'error')

    if (isResponse === isRequest) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }

    if (isResponse) {
        validateResponseMessage(messageObj)

        return {
            type: RpcMessageType.RESPONSE,
            message: messageObj,
        }
    }

    if (isRequest) {
        validateRequestMessage(messageObj)

        return {
            type: RpcMessageType.REQUEST,
            message: messageObj,
        }
    }

    // Unreachable code to prevent TS from complaining about missing return statement
    /* v8 ignore next -- @preserve */
    throw new RpcError(RpcErrorCode.INTERNAL_ERROR)
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

function validateRequestMessage<Methods extends MethodMap<Methods>>(
    message: RpcRequest<Methods> | Record<string, unknown>,
): asserts message is RpcRequest<Methods> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (Object.hasOwn(message, 'params') && typeof message.params !== 'object' && message.params !== null) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
}

function validateResponseMessage<Methods extends MethodMap<Methods>>(
    message: RpcResponse<Methods> | Record<string, unknown>,
): asserts message is RpcResponse<Methods> {
    if (isRpcErrorResponse(message)) {
        validateResponseError(message.error)
    }
}

function validateResponseError(error: Record<string, unknown> | RpcErrorData): asserts error is RpcErrorData {
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
