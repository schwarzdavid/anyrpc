import { describe, expect, it } from 'vitest'
import {
    ControlMethod,
    createControlMessage,
    readControlMethod,
} from '@/lib/adapter/message-port/utils/controlMessages'

describe(createControlMessage, () => {
    it('should create a JSON-RPC notification', () => {
        expect(createControlMessage(ControlMethod.PING)).toStrictEqual({
            jsonrpc: '2.0',
            method: 'anyrpc::ping',
            params: [],
        })
    })
})

describe(readControlMethod, () => {
    it.each(Object.values(ControlMethod))('should read the control method %s', (method) => {
        expect(readControlMethod(createControlMessage(method))).toBe(method)
    })

    it.each([
        ['an unknown method', { jsonrpc: '2.0', method: 'anyrpc::unknown', params: [] }],
        ['a message without method', { jsonrpc: '2.0', id: 'id', result: null }],
        ['a primitive', 'anyrpc::ping'],
        ['null', null],
    ])('should return undefined for %s', (_, data) => {
        expect(readControlMethod(data)).toBeUndefined()
    })
})
