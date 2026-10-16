import { RpcError } from '@/lib/RpcError'
import { RPC_ERROR_MESSAGE_MAP, type RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import type { RpcId } from '@/types/RpcMessages'

export interface RpcMessageErrorDetails {
    reason: string
    requestId: RpcId
    isResponse: boolean
}

export class RpcMessageError extends RpcError {
    readonly reason: string
    readonly requestId: RpcId
    readonly isResponse: boolean

    constructor(code: RpcErrorCode.PARSE_ERROR | RpcErrorCode.INVALID_REQUEST, details: RpcMessageErrorDetails) {
        super({ code, message: RPC_ERROR_MESSAGE_MAP[code], data: { reason: details.reason } })
        this.reason = details.reason
        this.requestId = details.requestId
        this.isResponse = details.isResponse
    }
}
