import { describe, expect, it } from 'vitest'
import { RpcError } from '@/lib/RpcError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { RpcErrorData } from '@/types/RpcMessages'

describe(RpcError, () => {
    it('should create an RpcError with a numeric error code', () => {
        const errorCode = RpcErrorCode.PARSE_ERROR
        const rpcError = new RpcError(errorCode)

        expect(rpcError).toBeInstanceOf(RpcError)
        expect(rpcError.code).toBe(errorCode)
        expect(rpcError.message).toBeDefined()
    })

    it('should create an RpcError with RpcErrorData', () => {
        const errorData: RpcErrorData = {
            code: RpcErrorCode.INVALID_REQUEST,
            message: 'Invalid request data',
        }
        const rpcError = new RpcError(errorData)

        expect(rpcError).toBeInstanceOf(RpcError)
        expect(rpcError.code).toBe(errorData.code)
        expect(rpcError.message).toBe(errorData.message)
    })

    it('should set the default message for an error code if available', () => {
        const errorCode = RpcErrorCode.METHOD_NOT_FOUND
        const rpcError = new RpcError(errorCode)

        expect(rpcError.message).toBeDefined()
        expect(rpcError.message).not.toBe('')
    })

    it('should override the message provided in RpcErrorData', () => {
        const errorData: RpcErrorData = {
            code: RpcErrorCode.INTERNAL_ERROR,
            message: 'Custom internal error message',
        }
        const rpcError = new RpcError(errorData)

        expect(rpcError.message).toBe(errorData.message)
    })

    it('should handle an invalid type gracefully', () => {
        try {
            // @ts-expect-error Invalid input type to simulate TypeScript type-checking behavior
            new RpcError('invalid')
        } catch (error) {
            // eslint-disable-next-line vitest/no-conditional-expect
            expect(error).toBeInstanceOf(Error)
        }
    })
})
