import { describe, expect, it } from 'vitest'
import { isApplicationErrorCode, isReservedMethodName, parseRpcMessage, RpcMessageType } from '@/utils/rpc'
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

    it('should parse a message without id as notification', () => {
        const notification = { jsonrpc: '2.0', method: 'exampleMethod', params: ['arg', 1] }

        const result = parseRpcMessage(notification)

        expect(result.type).toBe(RpcMessageType.NOTIFICATION)
        expect(result.message).toStrictEqual(notification)
    })

    it('should parse a message with null id as request', () => {
        const request = { jsonrpc: '2.0', id: null, method: 'exampleMethod', params: [] }

        expect(parseRpcMessage(request).type).toBe(RpcMessageType.REQUEST)
    })

    it('should default missing params of notifications to an empty array', () => {
        const result = parseRpcMessage({ jsonrpc: '2.0', method: 'exampleMethod' })

        expect(result.message).toStrictEqual({ jsonrpc: '2.0', method: 'exampleMethod', params: [] })
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

    it('should throw an error for messages that are neither request nor response', () => {
        const unknownMessage = {
            jsonrpc: '2.0',
            id: 1,
            params: { example: 'value' },
        }

        expect(() => parseRpcMessage(unknownMessage)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
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

    it('should default missing params to an empty array', () => {
        const result = parseRpcMessage({ jsonrpc: '2.0', id: '1', method: 'exampleMethod' })

        expect(result.message).toStrictEqual({ jsonrpc: '2.0', id: '1', method: 'exampleMethod', params: [] })
    })

    it('should accept named params', () => {
        const request = { jsonrpc: '2.0', id: '1', method: 'exampleMethod', params: { foo: 'arg' } }

        expect(parseRpcMessage(request).message).toStrictEqual(request)
    })

    it('should throw an error for null params', () => {
        const invalidRequest = { jsonrpc: '2.0', id: '1', method: 'exampleMethod', params: null }

        expect(() => parseRpcMessage(invalidRequest)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it('should throw an error for a non-string method', () => {
        const invalidRequest = { jsonrpc: '2.0', id: '1', method: 42, params: [] }

        expect(() => parseRpcMessage(invalidRequest)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it.each([
        ['null', null],
        ['a number', 42],
        ['an array', [validRequest]],
        ['a JSON array string', JSON.stringify([validRequest])],
        ['a JSON primitive string', '"text"'],
    ])('should throw an error for %s instead of a message object', (_, message) => {
        expect(() => parseRpcMessage(message as object)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it('should throw an error for a response without id', () => {
        const invalidResponse = { jsonrpc: '2.0', result: 'value' }

        expect(() => parseRpcMessage(invalidResponse)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it('should accept a response with null id', () => {
        const response = { jsonrpc: '2.0', id: null, error: { code: RpcErrorCode.PARSE_ERROR, message: 'Parse error' } }

        expect(parseRpcMessage(response).message).toStrictEqual(response)
    })

    it('should throw an error for a response containing result and error', () => {
        const invalidResponse = { jsonrpc: '2.0', id: 1, result: 'value', error: { code: 1, message: 'error' } }

        expect(() => parseRpcMessage(invalidResponse)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })

    it.each([
        ['null', null],
        ['a string', 'error'],
        ['an array', [1, 'error']],
    ])('should throw an error for a response with %s as error', (_, error) => {
        const invalidResponse = { jsonrpc: '2.0', id: 1, error }

        expect(() => parseRpcMessage(invalidResponse)).toThrowError(new RpcError(RpcErrorCode.INVALID_REQUEST))
    })
})

describe(isReservedMethodName, () => {
    it('should detect method names starting with rpc.', () => {
        expect(isReservedMethodName('rpc.discover')).toBe(true)
    })

    it.each(['exampleMethod', 'rpcMethod', Symbol('rpc.')])('should not treat %s as reserved', (method) => {
        expect(isReservedMethodName(method)).toBe(false)
    })
})

describe(isApplicationErrorCode, () => {
    it.each([-32768, -32700, -32603, -32000])('should treat reserved code %i as non-application code', (code) => {
        expect(isApplicationErrorCode(code)).toBe(false)
    })

    it.each([RpcErrorCode.TIMEOUT_ERROR, RpcErrorCode.NOT_CONNECTED])(
        'should treat local code %i as non-application code',
        (code) => {
            expect(isApplicationErrorCode(code)).toBe(false)
        },
    )

    it.each([-32769, -31999, 0, 4001])('should treat code %i as application code', (code) => {
        expect(isApplicationErrorCode(code)).toBe(true)
    })
})
