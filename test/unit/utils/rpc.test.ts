import { describe, expect, it } from 'vitest'
import { parseRpcMessage, RpcMessageType } from '@/utils/rpc'
import { RpcError } from '@/lib/RpcError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import type { RpcRequest } from '@/types/RpcMessages'

interface TestMethods {
    exampleMethod: (foo: string, bar: number) => Promise<string>
}

describe(parseRpcMessage, () => {
    const validRequest: RpcRequest<TestMethods, 'exampleMethod'> = {
        jsonrpc: '2.0',
        id: '1',
        method: 'exampleMethod',
        params: ['arg', 1],
    }

    const validResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: { success: true },
    }

    it('should parse a valid request message', () => {
        const result = parseRpcMessage(validRequest)

        expect(result.type).toBe(RpcMessageType.REQUEST)
        expect(result.message).toStrictEqual(validRequest)
    })

    it('should parse a valid request message json string', () => {
        const result = parseRpcMessage(JSON.stringify(validRequest))

        expect(result.type).toBe(RpcMessageType.REQUEST)
        expect(result.message).toStrictEqual(validRequest)
    })

    it('should parse a valid response message', () => {
        const result = parseRpcMessage(validResponse)

        expect(result.type).toBe(RpcMessageType.RESPONSE)
        expect(result.message).toStrictEqual(validResponse)
    })

    it('should parse a valid response message json string', () => {
        const result = parseRpcMessage(JSON.stringify(validResponse))

        expect(result.type).toBe(RpcMessageType.RESPONSE)
        expect(result.message).toStrictEqual(validResponse)
    })

    it('should throw an error for invalid JSON string messages', () => {
        const invalidJsonString = '{ "jsonrpc: 2.0, "id": 1 }'

        expect(() => parseRpcMessage(invalidJsonString)).toThrowError(new RpcError(RpcErrorCode.PARSE_ERROR))
    })

    it('should throw an error for invalid id field', () => {
        const invalidMessage = {
            id: false,
            jsonrpc: '2.0',
            method: 'exampleMethod',
            params: { example: 'value' },
        }

        expect(() => parseRpcMessage(invalidMessage)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it('should throw an error for floating number id field', () => {
        const invalidMessage = {
            id: 1.1,
            jsonrpc: '2.0',
            method: 'exampleMethod',
            params: { example: 'value' },
        }

        expect(() => parseRpcMessage(invalidMessage)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it('should not throw an error if id is missing', () => {
        const message = { ...validRequest }

        // @ts-ignore
        delete message.id

        expect(() => parseRpcMessage(message)).not.toThrowError()
    })

    it('should throw an error for missing jsonrpc field', () => {
        const invalidMessage = {
            id: 1,
            method: 'exampleMethod',
            params: { example: 'value' },
        }

        expect(() => parseRpcMessage(invalidMessage)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it('should throw an error for ambiguity types', () => {
        const ambiguousMessage = {
            jsonrpc: '2.0',
            id: 1,
            result: { success: true },
            method: 'exampleMethod',
        }

        expect(() => parseRpcMessage(ambiguousMessage)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it('should throw an error for invalid params in a request', () => {
        const invalidRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'exampleMethod',
            params: 'invalidParams',
        }

        expect(() => parseRpcMessage(invalidRequest)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it('should throw an error for response with invalid error code', () => {
        const invalidResponse = {
            jsonrpc: '2.0',
            id: 1,
            error: { code: 'notAnInteger', message: 'error message' },
        }

        expect(() => parseRpcMessage(invalidResponse)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it('should throw an error for response with invalid error message', () => {
        const invalidResponse = {
            jsonrpc: '2.0',
            id: 1,
            error: { code: 1, message: false },
        }

        expect(() => parseRpcMessage(invalidResponse)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })
})
