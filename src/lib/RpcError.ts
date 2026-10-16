import type { RpcErrorData } from '@/types/RpcMessages'
import { RPC_ERROR_MESSAGE_MAP, RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'

export class RpcError extends Error implements RpcErrorData {
    readonly code: number

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly data?: any

    constructor(errorCode: RpcErrorCode)
    constructor(error: RpcErrorData, includeStack?: boolean)
    constructor(
        errorCode: RpcErrorCode | RpcErrorData,
        private readonly includeStack = false,
    ) {
        if (typeof errorCode === 'number') {
            super(RPC_ERROR_MESSAGE_MAP[errorCode])
            this.code = errorCode
        } else {
            super(errorCode.message)
            this.code = errorCode.code
            this.message = errorCode.message
            this.data = errorCode.data
        }
    }

    toJSON(): RpcErrorData {
        return {
            code: this.code,
            message: this.message,
            data:
                this.data instanceof Error
                    ? {
                          message: this.data.message,
                          name: this.data.name,
                          stack: this.includeStack ? this.data.stack : undefined,
                      }
                    : this.data,
        }
    }
}
