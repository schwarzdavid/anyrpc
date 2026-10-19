import { describe, expect, it } from 'vitest'
import { readMessageData } from '@/lib/adapter/message-port/utils/messageData'

describe(readMessageData, () => {
    it('should return the data of a message event', () => {
        expect(readMessageData(new MessageEvent('message', { data: { foo: 'bar' } }))).toStrictEqual({ foo: 'bar' })
    })

    it('should return undefined for an event without data', () => {
        expect(readMessageData(new Event('message'))).toBeUndefined()
    })
})
