import { describe, expect, it } from 'vitest'
import { createIpcEnvelope, readIpcEnvelope } from '@/lib/adapter/child-process/utils/ipcEnvelope'

const message = { jsonrpc: '2.0', method: 'foo', params: [] }

describe(createIpcEnvelope, () => {
    it('should wrap a message with the channel name', () => {
        expect(createIpcEnvelope('my-app', message)).toStrictEqual({ anyrpc: 'my-app', message })
    })
})

describe(readIpcEnvelope, () => {
    it('should unwrap a message for the channel name', () => {
        expect(readIpcEnvelope({ anyrpc: 'my-app', message }, 'my-app')).toStrictEqual(message)
    })

    it('should ignore envelopes for another channel', () => {
        expect(readIpcEnvelope({ anyrpc: 'other-app', message }, 'my-app')).toBeUndefined()
    })

    it.each([
        null,
        'my-app',
        { type: 'ready' },
        { anyrpc: 'my-app' },
        { message },
        { anyrpc: 'my-app', message: 'text' },
        { anyrpc: 'my-app', message: null },
    ])('should ignore %j', (value) => {
        expect(readIpcEnvelope(value, 'my-app')).toBeUndefined()
    })
})
