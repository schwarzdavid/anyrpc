import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ControlProtocol, type ControlProtocolCallbacks } from '@/lib/ControlProtocol'
import { ControlMethod, createControlMessage } from '@/utils/controlMessages'

function createCallbacks() {
    return {
        send: vi.fn<ControlProtocolCallbacks['send']>(),
        onPong: vi.fn<() => void>(),
        onTimeout: vi.fn<() => void>(),
        onGoodbye: vi.fn<() => void>(),
    }
}

describe(ControlProtocol, () => {
    let callbacks: ReturnType<typeof createCallbacks>
    let protocol: ControlProtocol

    beforeEach(() => {
        vi.useFakeTimers()
        callbacks = createCallbacks()
        protocol = new ControlProtocol({ interval: 1000, timeout: 3000 }, callbacks)
    })

    afterEach(() => {
        protocol.stopHeartbeat()
        vi.useRealTimers()
    })

    it('should answer a ping with a pong', () => {
        expect(protocol.handle(createControlMessage(ControlMethod.PING))).toBe(true)
        expect(callbacks.send).toHaveBeenCalledWith(createControlMessage(ControlMethod.PONG))
    })

    it('should report a pong and acknowledge the heartbeat', () => {
        protocol.startHeartbeat()
        vi.advanceTimersByTime(1000)

        expect(protocol.handle(createControlMessage(ControlMethod.PONG))).toBe(true)

        vi.advanceTimersByTime(2500)

        expect(callbacks.onPong).toHaveBeenCalledTimes(1)
        expect(callbacks.onTimeout).not.toHaveBeenCalled()
    })

    it('should report a goodbye', () => {
        expect(protocol.handle(createControlMessage(ControlMethod.GOODBYE))).toBe(true)
        expect(callbacks.onGoodbye).toHaveBeenCalledTimes(1)
    })

    it.each([{ jsonrpc: '2.0', method: 'foo', params: [] }, 'anyrpc::ping', null])('should not handle %j', (data) => {
        expect(protocol.handle(data)).toBe(false)
        expect(callbacks.send).not.toHaveBeenCalled()
    })

    it('should ping once per interval and report a timeout without pong', () => {
        protocol.startHeartbeat()
        vi.advanceTimersByTime(4000)

        expect(callbacks.send).toHaveBeenCalledWith(createControlMessage(ControlMethod.PING))
        expect(callbacks.onTimeout).toHaveBeenCalledTimes(1)
    })

    it('should stop pinging once the heartbeat is stopped', () => {
        protocol.startHeartbeat()
        protocol.stopHeartbeat()
        vi.advanceTimersByTime(5000)

        expect(callbacks.send).not.toHaveBeenCalled()
    })

    it('should not ping without heartbeat options', () => {
        protocol = new ControlProtocol(undefined, callbacks)

        protocol.startHeartbeat()
        vi.advanceTimersByTime(5000)

        expect(callbacks.send).not.toHaveBeenCalled()
    })

    it('should send a single ping and a goodbye on demand', () => {
        protocol.ping()
        protocol.sayGoodbye()

        expect(callbacks.send.mock.calls).toStrictEqual([
            [createControlMessage(ControlMethod.PING)],
            [createControlMessage(ControlMethod.GOODBYE)],
        ])
    })
})
