import { describe, expect, it } from 'vitest'
import { RpcMessageError } from '@/lib/RpcMessageError'
import { RpcError } from '@/lib/RpcError'
import { RPC_ERROR_MESSAGE_MAP, RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'

describe(RpcMessageError, () => {
    const error = new RpcMessageError(RpcErrorCode.INVALID_REQUEST, {
        reason: '"method" must be a string',
        requestId: 'request-id',
        isResponse: false,
    })

    it('should be an RpcError with the standard message of its code', () => {
        expect(error).toBeInstanceOf(RpcError)
        expect(error.code).toBe(RpcErrorCode.INVALID_REQUEST)
        expect(error.message).toBe(RPC_ERROR_MESSAGE_MAP[RpcErrorCode.INVALID_REQUEST])
    })

    it('should expose the details of the invalid message', () => {
        expect(error.reason).toBe('"method" must be a string')
        expect(error.requestId).toBe('request-id')
        expect(error.isResponse).toBe(false)
    })

    it('should serialize the reason as data', () => {
        expect(error.toJSON()).toStrictEqual({
            code: RpcErrorCode.INVALID_REQUEST,
            message: RPC_ERROR_MESSAGE_MAP[RpcErrorCode.INVALID_REQUEST],
            data: { reason: '"method" must be a string' },
        })
    })
})
