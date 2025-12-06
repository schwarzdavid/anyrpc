import { describe, expectTypeOf, it } from 'vitest'
import { parseRpcMessage, RpcMessageType } from '@/utils/rpc'
import { RpcRequest, RpcResponse } from '@/types/RpcMessages'

interface TestMethods {
    exampleMethod: (foo: string, bar: number) => Promise<string>
}

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

describe(parseRpcMessage, () => {
    it('should be callable with string', () => {
        expectTypeOf<typeof parseRpcMessage>().toBeCallableWith('...')
    })

    it('should be callable with an object', () => {
        expectTypeOf<typeof parseRpcMessage>().toBeCallableWith({})
        expectTypeOf<typeof parseRpcMessage>().toBeCallableWith({ foo: 'bar' })
    })

    it('should return a RpcResponse', () => {
        const response: RpcResponse<TestMethods, 'exampleMethod'> = {
            id: 'test',
            jsonrpc: '2.0',
            result: 'result',
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result = parseRpcMessage<TestMethods, TestEvents>(response)

        type ResultType = Extract<typeof result, { type: RpcMessageType.RESPONSE }>

        expectTypeOf<ResultType['message']>().toExtend<RpcResponse<TestMethods>>()
        expectTypeOf<ResultType['message']>().not.toMatchObjectType<RpcResponse<TestEvents>>()
    })

    it('should return a RpcRequest', () => {
        const request: RpcRequest<TestEvents, 'testEvent'> = {
            id: 'test',
            jsonrpc: '2.0',
            method: 'testEvent',
            params: ['arg'],
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result = parseRpcMessage<TestMethods, TestEvents>(request)

        type ResultType = Extract<typeof result, { type: RpcMessageType.REQUEST }>

        expectTypeOf<ResultType['message']>().toExtend<RpcRequest<TestEvents>>()
        expectTypeOf<ResultType['message']>().not.toMatchObjectType<RpcRequest<TestMethods>>()
    })
})
