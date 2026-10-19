import { describe, expect, it, vi } from 'vitest'
import {
    createInitRequest,
    createInitResponse,
    isInitRequest,
    isInitResponse,
} from '@/lib/adapter/message-port/utils/handshake'
import { parseRpcMessage } from '@/utils/rpc'

vi.mock(import('@/utils/uuid'), () => ({
    uuid: vi.fn<() => string>(() => 'init-id'),
}))

vi.mock(import('@/utils/rpc'), async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, parseRpcMessage: vi.fn<typeof actual.parseRpcMessage>(actual.parseRpcMessage) }
})

const METHOD = 'anyrpc::test-init'

describe(createInitRequest, () => {
    it('should create a request with a unique id and the name as only param', () => {
        expect(createInitRequest(METHOD, 'my-app')).toStrictEqual({
            jsonrpc: '2.0',
            id: 'init-id',
            method: METHOD,
            params: ['my-app'],
        })
    })
})

describe(isInitRequest, () => {
    it('should accept init requests for the given method and name', () => {
        expect(isInitRequest(createInitRequest(METHOD, 'my-app'), METHOD, 'my-app')).toBe(true)
    })

    it.each([
        ['a different name', createInitRequest(METHOD, 'other-app')],
        ['a different method', createInitRequest('anyrpc::other-init', 'my-app')],
        ['a notification', { jsonrpc: '2.0', method: METHOD, params: ['my-app'] }],
        ['named params', { jsonrpc: '2.0', id: 'init-id', method: METHOD, params: { name: 'my-app' } }],
        ['an invalid message', { foo: 'bar' }],
        ['a primitive', 'my-app'],
        ['null', null],
    ])('should reject %s', (_, data) => {
        expect(isInitRequest(data, METHOD, 'my-app')).toBe(false)
    })

    it('should not parse messages for other methods', () => {
        vi.mocked(parseRpcMessage).mockClear()

        isInitRequest({ jsonrpc: '2.0', id: 1, method: 'progress', params: [42] }, METHOD, 'my-app')
        isInitRequest({ type: 'progress' }, METHOD, 'my-app')
        isInitRequest('hello', METHOD, 'my-app')

        expect(parseRpcMessage).not.toHaveBeenCalled()
    })
})

describe(createInitResponse, () => {
    it('should answer the request with a null result', () => {
        expect(createInitResponse(createInitRequest(METHOD, 'my-app'))).toStrictEqual({
            jsonrpc: '2.0',
            id: 'init-id',
            result: null,
        })
    })
})

describe(isInitResponse, () => {
    it('should accept null results for the given request id', () => {
        expect(isInitResponse({ jsonrpc: '2.0', id: 'init-id', result: null }, 'init-id')).toBe(true)
    })

    it.each([
        ['another id', { jsonrpc: '2.0', id: 'other-id', result: null }],
        ['a non-null result', { jsonrpc: '2.0', id: 'init-id', result: 'connected' }],
        ['an error response', { jsonrpc: '2.0', id: 'init-id', error: { code: -32000, message: 'Server error' } }],
        ['a request', createInitRequest(METHOD, 'my-app')],
        ['an invalid message', { jsonrpc: '1.0', id: 'init-id', result: null }],
        ['undefined', undefined],
    ])('should reject %s', (_, data) => {
        expect(isInitResponse(data, 'init-id')).toBe(false)
    })

    it('should not parse responses to other requests', () => {
        vi.mocked(parseRpcMessage).mockClear()

        isInitResponse({ jsonrpc: '2.0', id: 'other-id', result: null }, 'init-id')
        isInitResponse({ type: 'progress' }, 'init-id')
        isInitResponse(undefined, 'init-id')

        expect(parseRpcMessage).not.toHaveBeenCalled()
    })
})
