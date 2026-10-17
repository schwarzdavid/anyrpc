import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HEARTBEAT_OPTIONS, Heartbeat, type HeartbeatCallbacks, resolveHeartbeatOptions } from '@/lib/Heartbeat'

describe(Heartbeat, () => {
    let callbacks: { [K in keyof HeartbeatCallbacks]: ReturnType<typeof vi.fn<HeartbeatCallbacks[K]>> }
    let heartbeat: Heartbeat

    beforeEach(() => {
        vi.useFakeTimers()
        callbacks = { ping: vi.fn<() => void>(), onTimeout: vi.fn<() => void>() }
        heartbeat = new Heartbeat({ interval: 100, timeout: 250 }, callbacks)
    })

    afterEach(() => {
        heartbeat.stop()
        vi.useRealTimers()
    })

    it('should ping once per interval after starting', () => {
        heartbeat.start()
        vi.advanceTimersByTime(99)

        expect(callbacks.ping).not.toHaveBeenCalled()

        vi.advanceTimersByTime(201)

        expect(callbacks.ping).toHaveBeenCalledTimes(3)
    })

    it('should time out if no ping is acknowledged within the timeout', () => {
        heartbeat.start()
        vi.advanceTimersByTime(349)

        expect(callbacks.onTimeout).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)

        expect(callbacks.onTimeout).toHaveBeenCalledTimes(1)
    })

    it('should not time out while pings are acknowledged', () => {
        callbacks.ping.mockImplementation(() => heartbeat.acknowledge())

        heartbeat.start()
        vi.advanceTimersByTime(1000)

        expect(callbacks.ping).toHaveBeenCalledTimes(10)
        expect(callbacks.onTimeout).not.toHaveBeenCalled()
    })

    it('should keep pinging and time out again after a timeout', () => {
        heartbeat.start()
        vi.advanceTimersByTime(700)

        expect(callbacks.onTimeout).toHaveBeenCalledTimes(2)
        expect(callbacks.ping).toHaveBeenCalledTimes(7)
    })

    it('should stop pinging and cancel the timeout when stopped', () => {
        heartbeat.start()
        vi.advanceTimersByTime(100)
        heartbeat.stop()
        vi.advanceTimersByTime(1000)

        expect(callbacks.ping).toHaveBeenCalledTimes(1)
        expect(callbacks.onTimeout).not.toHaveBeenCalled()
    })

    it('should restart cleanly when started twice', () => {
        heartbeat.start()
        vi.advanceTimersByTime(50)
        heartbeat.start()
        vi.advanceTimersByTime(100)

        expect(callbacks.ping).toHaveBeenCalledTimes(1)
    })
})

describe(resolveHeartbeatOptions, () => {
    it('should disable the heartbeat for false', () => {
        expect(resolveHeartbeatOptions(false)).toBeUndefined()
    })

    it('should use the defaults for true', () => {
        expect(resolveHeartbeatOptions(true)).toStrictEqual(DEFAULT_HEARTBEAT_OPTIONS)
    })

    it('should merge partial options with the defaults', () => {
        expect(resolveHeartbeatOptions({ timeout: 100 })).toStrictEqual({
            interval: DEFAULT_HEARTBEAT_OPTIONS.interval,
            timeout: 100,
        })
    })
})
