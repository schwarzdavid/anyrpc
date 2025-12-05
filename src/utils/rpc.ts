import { RpcError } from '@/lib/RpcError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { RpcErrorData, RpcErrorResponse, RpcRequest, RpcResponse, RpcSuccessResponse } from '@/types/RpcMessages'
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
    | RpcResponseParsingResult<Events>
    | RpcRequestParsingResult<Methods>

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

    const isResponse = Object.hasOwn(messageObj, 'method')
    const isRequest = Object.hasOwn(messageObj, 'result') || Object.hasOwn(messageObj, 'error')

    if (isRequest === isResponse) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }

    if (isRequest) {
        const requestMessage = messageObj as unknown as RpcRequest<Methods, keyof Methods>
        validateRequestMessage(requestMessage)

        return {
            type: RpcMessageType.REQUEST,
            message: requestMessage,
        }
    }

    if (isResponse) {
        const responseMessage = messageObj as unknown as RpcResponse<Events, keyof Events>
        validateResponseMessage(responseMessage)

        return {
            type: RpcMessageType.RESPONSE,
            message: responseMessage,
        }
    }

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

function validateRequestMessage<Methods extends MethodMap<Methods>>(message: RpcRequest<Methods, keyof Methods>): void {
    if (Object.hasOwn(message, 'params') && typeof message.params !== 'object' && message.params !== null) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
}

function validateResponseMessage<Methods extends MethodMap<Methods>>(
    message: RpcResponse<Methods, keyof Methods>,
): void {
    if (isRpcErrorResponse(message)) {
        validateResponseError(message.error)
    }
}

function validateResponseError(error: Record<string, unknown> | RpcErrorData): void {
    if (!Number.isInteger(error.code)) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
    if (typeof error.message !== 'string') {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
}

export function isRpcSuccessResponse<Methods extends MethodMap<Methods>, Name extends keyof Methods = keyof Methods>(
    message: RpcResponse<Methods, Name>,
): message is RpcSuccessResponse<Methods[Name]> {
    return Object.hasOwn(message, 'result')
}

export function isRpcErrorResponse(message: RpcResponse<MethodMap<never>, string>): message is RpcErrorResponse {
    return Object.hasOwn(message, 'error')
}
