import { RpcError } from '@/lib/RpcError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { RpcErrorData, RpcErrorResponse, RpcRequest, RpcResponse, RpcSuccessResponse } from '@/types/RpcMessages'

export const enum RpcMessageType {
    REQUEST,
    RESPONSE,
}

export interface RpcResponseParsingResult {
    message: RpcResponse
    type: RpcMessageType.RESPONSE
}

export interface RpcRequestParsingResult {
    message: RpcRequest
    type: RpcMessageType.REQUEST
}

export type RpcParsingResult = RpcResponseParsingResult | RpcRequestParsingResult

export function parseRpcMessage(message: string | object): RpcParsingResult {
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
        const requestMessage = messageObj as unknown as RpcRequest
        validateRequestMessage(requestMessage)

        return {
            type: RpcMessageType.REQUEST,
            message: requestMessage,
        }
    }

    if (isResponse) {
        const responseMessage = messageObj as unknown as RpcResponse
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

function validateRequestMessage(message: RpcRequest): void {
    if (Object.hasOwn(message, 'params') && typeof message.params !== 'object' && message.params !== null) {
        throw new RpcError(RpcErrorCode.INVALID_REQUEST)
    }
}

function validateResponseMessage(message: RpcResponse): void {
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

export function isRpcSuccessResponse(message: RpcResponse): message is RpcSuccessResponse {
    return Object.hasOwn(message, 'result')
}

export function isRpcErrorResponse(message: RpcResponse): message is RpcErrorResponse {
    return Object.hasOwn(message, 'error')
}
