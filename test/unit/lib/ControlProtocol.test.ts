import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ControlProtocol, type ControlProtocolHost } from '@/lib/ControlProtocol'
import { Logger } from '@/lib/Logger'
import { LogLevel } from '@/types/LogLevel'
import { ControlMethod, createControlMessage } from '@/utils/controlMessages'

function createHost(logger?: Logger) {
    return {
        send: vi.fn<ControlProtocolHost['send']>(),
        isConnected: vi.fn<() => boolean>(() => false),
        getLogger: () => logger,
        onResponsive: vi.fn<() => void>(),
        onUnresponsive: vi.fn<() => void>(),
        onGoodbye: vi.fn<() => void>(),
    }
}

describe(ControlProtocol, () => {
    let logger: Logger
    let host: ReturnType<typeof createHost>
    let protocol: ControlProtocol

    beforeEach(() => {
        vi.useFakeTimers()
        logger = new Logger('Test', LogLevel.NONE)
        vi.spyOn(logger, 'info')
        vi.spyOn(logger, 'warn')
        vi.spyOn(logger, 'debug')
        host = createHost(logger)
        protocol = new ControlProtocol({ interval: 1000, timeout: 3000 }, host)
    })

    afterEach(() => {
        protocol.stop()
        vi.useRealTimers()
    })

    it('should answer a ping with a pong', () => {
        expect(protocol.handle(createControlMessage(ControlMethod.PING))).toBe(true)
        expect(host.send).toHaveBeenCalledWith(createControlMessage(ControlMethod.PONG))
    })

    it('should acknowledge the heartbeat and report a disconnected remote as responsive on a pong', () => {
        protocol.startHeartbeat()
        vi.advanceTimersByTime(1000)

        expect(protocol.handle(createControlMessage(ControlMethod.PONG))).toBe(true)

        vi.advanceTimersByTime(2500)

        expect(host.onResponsive).toHaveBeenCalledTimes(1)
        expect(host.onUnresponsive).not.toHaveBeenCalled()
        expect(logger.info).toHaveBeenCalledWith('The remote side is responding again')
    })

    it('should not report a connected remote as responsive again', () => {
        host.isConnected.mockReturnValue(true)

        protocol.handle(createControlMessage(ControlMethod.PONG))

        expect(host.onResponsive).not.toHaveBeenCalled()
        expect(logger.info).not.toHaveBeenCalled()
    })

    it('should ping an awaited remote and report its first pong as an accepted connection', () => {
        protocol.awaitRemote()

        expect(host.send).toHaveBeenCalledWith(createControlMessage(ControlMethod.PING))

        protocol.handle(createControlMessage(ControlMethod.PONG))
        protocol.handle(createControlMessage(ControlMethod.PONG))

        expect(vi.mocked(logger.info).mock.calls).toStrictEqual([
            ['The remote side accepted the connection'],
            ['The remote side is responding again'],
        ])
        expect(host.onResponsive).toHaveBeenCalledTimes(2)
    })

    it('should stop awaiting the remote once stopped', () => {
        protocol.awaitRemote()
        protocol.stop()

        protocol.handle(createControlMessage(ControlMethod.PONG))

        expect(logger.info).toHaveBeenCalledWith('The remote side is responding again')
    })

    it('should report a goodbye', () => {
        expect(protocol.handle(createControlMessage(ControlMethod.GOODBYE))).toBe(true)
        expect(host.onGoodbye).toHaveBeenCalledTimes(1)
        expect(logger.debug).toHaveBeenCalledWith('The remote side closed the connection')
    })

    it.each([{ jsonrpc: '2.0', method: 'foo', params: [] }, 'anyrpc::ping', null])('should not handle %j', (data) => {
        expect(protocol.handle(data)).toBe(false)
        expect(host.send).not.toHaveBeenCalled()
    })

    it('should ping once per interval and report a connected remote as unresponsive without pong', () => {
        host.isConnected.mockReturnValue(true)

        protocol.startHeartbeat()
        vi.advanceTimersByTime(4000)

        expect(host.send).toHaveBeenCalledWith(createControlMessage(ControlMethod.PING))
        expect(host.onUnresponsive).toHaveBeenCalledTimes(1)
        expect(logger.warn).toHaveBeenCalledWith('The remote side did not answer the heartbeat in time')
    })

    it('should not report a disconnected remote as unresponsive', () => {
        protocol.startHeartbeat()
        vi.advanceTimersByTime(4000)

        expect(host.onUnresponsive).not.toHaveBeenCalled()
        expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should stop pinging once stopped', () => {
        protocol.startHeartbeat()
        protocol.stop()
        vi.advanceTimersByTime(5000)

        expect(host.send).not.toHaveBeenCalled()
    })

    it('should not ping without heartbeat options', () => {
        protocol = new ControlProtocol(undefined, host)

        protocol.startHeartbeat()
        vi.advanceTimersByTime(5000)

        expect(host.send).not.toHaveBeenCalled()
    })

    it('should work without a logger', () => {
        host = createHost()
        host.isConnected.mockReturnValue(true)
        protocol = new ControlProtocol({ interval: 1000, timeout: 3000 }, host)

        protocol.startHeartbeat()
        vi.advanceTimersByTime(4000)
        host.isConnected.mockReturnValue(false)
        protocol.handle(createControlMessage(ControlMethod.PONG))
        protocol.handle(createControlMessage(ControlMethod.GOODBYE))

        expect(host.onUnresponsive).toHaveBeenCalledTimes(1)
        expect(host.onResponsive).toHaveBeenCalledTimes(1)
        expect(host.onGoodbye).toHaveBeenCalledTimes(1)
    })

    it('should send a goodbye on demand', () => {
        protocol.sayGoodbye()

        expect(host.send.mock.calls).toStrictEqual([[createControlMessage(ControlMethod.GOODBYE)]])
    })
})
