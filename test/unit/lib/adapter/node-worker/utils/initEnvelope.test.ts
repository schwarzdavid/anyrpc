import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInitEnvelope, readInitEnvelope } from '@/lib/adapter/node-worker/utils/initEnvelope'
import type { InitResponse } from '@/lib/adapter/message-port/utils/handshake'

const response: InitResponse = { jsonrpc: '2.0', id: 'init-id', result: null }

describe(createInitEnvelope, () => {
    it('should wrap the response and the ports', () => {
        const channel = new MessageChannel()

        expect(createInitEnvelope(response, [channel.port2])).toStrictEqual({ response, ports: [channel.port2] })
    })
})

describe(readInitEnvelope, () => {
    let channel: MessageChannel

    beforeEach(() => {
        channel = new MessageChannel()
    })

    afterEach(() => {
        channel.port1.close()
    })

    it('should read an envelope with message ports', () => {
        expect(readInitEnvelope({ response, ports: [channel.port1, channel.port2] })).toStrictEqual({
            response,
            ports: [channel.port1, channel.port2],
        })
    })

    it.each([null, undefined, 'init', 42, [], { response }, { ports: [] }])('should ignore %j', (value) => {
        expect(readInitEnvelope(value)).toBeUndefined()
    })

    it('should ignore an envelope whose ports are not an array', () => {
        expect(readInitEnvelope({ response, ports: channel.port1 })).toBeUndefined()
    })

    it('should ignore an envelope that contains something other than message ports', () => {
        expect(readInitEnvelope({ response, ports: [channel.port1, {}] })).toBeUndefined()
        expect(readInitEnvelope({ response, ports: [null] })).toBeUndefined()
    })
})
