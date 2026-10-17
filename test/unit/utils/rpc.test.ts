import { describe, expect, it } from 'vitest'
import { isApplicationErrorCode, isReservedMethodName, parseRpcMessage, RpcMessageType } from '@/utils/rpc'
import { RpcMessageError, type RpcMessageErrorDetails } from '@/lib/RpcMessageError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import type { RpcRequest } from '@/types/RpcMessages'

interface TestMethods {
    exampleMethod: (foo: string, bar: number) => Promise<string>
}

function catchParsingError(message: unknown): RpcMessageError {
    try {
        parseRpcMessage(message as object)
    } catch (error) {
        return error as RpcMessageError
    }
    throw new Error('Expected parseRpcMessage to throw')
}

function invalidRequest(details: Partial<RpcMessageErrorDetails>) {
    return {
        code: RpcErrorCode.INVALID_REQUEST,
        requestId: null,
        isResponse: false,
        ...details,
        data: { reason: details.reason },
    }
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

    describe('valid messages', () => {
        it('should parse a request', () => {
            const result = parseRpcMessage(validRequest)

            expect(result.type).toBe(RpcMessageType.REQUEST)
            expect(result.message).toStrictEqual(validRequest)
        })

        it('should parse a request from a JSON string', () => {
            const result = parseRpcMessage(JSON.stringify(validRequest))

            expect(result.type).toBe(RpcMessageType.REQUEST)
            expect(result.message).toStrictEqual(validRequest)
        })

        it('should parse a response', () => {
            const result = parseRpcMessage(validResponse)

            expect(result.type).toBe(RpcMessageType.RESPONSE)
            expect(result.message).toStrictEqual(validResponse)
        })

        it('should parse a response from a JSON string', () => {
            const result = parseRpcMessage(JSON.stringify(validResponse))

            expect(result.type).toBe(RpcMessageType.RESPONSE)
            expect(result.message).toStrictEqual(validResponse)
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

        it('should default missing params to an empty array', () => {
            const result = parseRpcMessage({ jsonrpc: '2.0', id: '1', method: 'exampleMethod' })

            expect(result.message).toStrictEqual({ jsonrpc: '2.0', id: '1', method: 'exampleMethod', params: [] })
        })

        it('should default missing params of notifications to an empty array', () => {
            const result = parseRpcMessage({ jsonrpc: '2.0', method: 'exampleMethod' })

            expect(result.message).toStrictEqual({ jsonrpc: '2.0', method: 'exampleMethod', params: [] })
        })

        it('should accept named params', () => {
            const request = { jsonrpc: '2.0', id: '1', method: 'exampleMethod', params: { foo: 'arg' } }

            expect(parseRpcMessage(request).message).toStrictEqual(request)
        })

        it('should accept an error response with null id', () => {
            const response = {
                jsonrpc: '2.0',
                id: null,
                error: { code: RpcErrorCode.PARSE_ERROR, message: 'Parse error' },
            }

            expect(parseRpcMessage(response).message).toStrictEqual(response)
        })
    })

    describe('invalid messages', () => {
        it('should throw a parse error without id for invalid JSON', () => {
            const error = catchParsingError('{ "jsonrpc: 2.0, "id": 1 }')

            expect(error).toBeInstanceOf(RpcMessageError)
            expect(error.code).toBe(RpcErrorCode.PARSE_ERROR)
            expect(error).toMatchObject({ reason: 'message is not valid JSON', requestId: null, isResponse: false })
        })

        it.each([
            ['an array', [validRequest]],
            ['a JSON array string', JSON.stringify([validRequest])],
        ])('should reject %s as unsupported batch', (_, message) => {
            expect(catchParsingError(message)).toMatchObject(
                invalidRequest({ reason: 'batch requests are not supported' }),
            )
        })

        it.each([
            ['null', null],
            ['a number', 42],
            ['a JSON primitive string', '"text"'],
        ])('should reject %s instead of a message object', (_, message) => {
            expect(catchParsingError(message)).toMatchObject(
                invalidRequest({ reason: 'message must be a JSON object' }),
            )
        })

        it('should reject a missing jsonrpc field and keep the detected id', () => {
            expect(catchParsingError({ id: 1, method: 'exampleMethod', params: [] })).toMatchObject(
                invalidRequest({ reason: '"jsonrpc" must be exactly "2.0"', requestId: 1 }),
            )
        })

        it.each([
            ['a boolean', false],
            ['a floating point number', 1.1],
            ['an object', { nested: true }],
        ])('should reject %s as id and respond with null id', (_, id) => {
            expect(catchParsingError({ jsonrpc: '2.0', id, method: 'exampleMethod', params: [] })).toMatchObject(
                invalidRequest({ reason: '"id" must be a string, an integer or null', requestId: null }),
            )
        })

        it('should reject a non-string method', () => {
            expect(catchParsingError({ jsonrpc: '2.0', id: 'request-id', method: 42, params: [] })).toMatchObject(
                invalidRequest({ reason: '"method" must be a string', requestId: 'request-id' }),
            )
        })

        it.each([
            ['a string', 'invalidParams'],
            ['null', null],
        ])('should reject %s as params', (_, params) => {
            expect(
                catchParsingError({ jsonrpc: '2.0', id: 'request-id', method: 'exampleMethod', params }),
            ).toMatchObject(
                invalidRequest({ reason: '"params" must be an array or an object', requestId: 'request-id' }),
            )
        })

        it('should reject an invalid notification without id', () => {
            expect(catchParsingError({ jsonrpc: '2.0', method: 1, params: 'bar' })).toMatchObject(
                invalidRequest({ reason: '"method" must be a string', requestId: null }),
            )
        })

        it('should reject messages that are neither request nor response', () => {
            expect(catchParsingError({ jsonrpc: '2.0', id: 1, params: [] })).toMatchObject(
                invalidRequest({ reason: 'message must contain either "method" or "result"/"error"', requestId: 1 }),
            )
        })

        it('should reject messages containing method and result as response-like', () => {
            expect(catchParsingError({ jsonrpc: '2.0', id: 1, result: true, method: 'exampleMethod' })).toMatchObject(
                invalidRequest({
                    reason: 'message must not contain "method" together with "result" or "error"',
                    requestId: 1,
                    isResponse: true,
                }),
            )
        })

        it('should reject a response without id', () => {
            expect(catchParsingError({ jsonrpc: '2.0', result: 'value' })).toMatchObject(
                invalidRequest({ reason: 'responses must contain an "id"', isResponse: true }),
            )
        })

        it('should reject a response containing result and error', () => {
            expect(
                catchParsingError({ jsonrpc: '2.0', id: 1, result: 'value', error: { code: 1, message: 'error' } }),
            ).toMatchObject(
                invalidRequest({
                    reason: 'responses must not contain both "result" and "error"',
                    requestId: 1,
                    isResponse: true,
                }),
            )
        })

        it.each([
            ['null', null],
            ['a string', 'error'],
            ['an array', [1, 'error']],
        ])('should reject %s as error object', (_, error) => {
            expect(catchParsingError({ jsonrpc: '2.0', id: 1, error })).toMatchObject(
                invalidRequest({ reason: '"error" must be an object', requestId: 1, isResponse: true }),
            )
        })

        it('should reject an error object with a non-integer code', () => {
            expect(
                catchParsingError({ jsonrpc: '2.0', id: 1, error: { code: 'notAnInteger', message: 'error message' } }),
            ).toMatchObject(
                invalidRequest({ reason: '"error.code" must be an integer', requestId: 1, isResponse: true }),
            )
        })

        it('should reject an error object with a non-string message', () => {
            expect(catchParsingError({ jsonrpc: '2.0', id: 1, error: { code: 1, message: false } })).toMatchObject(
                invalidRequest({ reason: '"error.message" must be a string', requestId: 1, isResponse: true }),
            )
        })
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

    it.each([RpcErrorCode.TIMEOUT_ERROR, RpcErrorCode.NOT_CONNECTED, RpcErrorCode.CONNECTION_LOST])(
        'should treat local code %i as non-application code',
        (code) => {
            expect(isApplicationErrorCode(code)).toBe(false)
        },
    )

    it.each([-32769, -31999, 0, 4001])('should treat code %i as application code', (code) => {
        expect(isApplicationErrorCode(code)).toBe(true)
    })
})
