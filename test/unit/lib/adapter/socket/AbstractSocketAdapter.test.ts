import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AbstractSocketAdapter } from '@/lib/adapter/socket/AbstractSocketAdapter'
import type { HeartbeatOptions } from '@/lib/Heartbeat'
import type { ConnectionLostHandler, MessageHandler } from '@/lib/adapter/AbstractRpcAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { RpcRequest } from '@/types/RpcMessages'
import { ControlMethod, createControlMessage } from '@/utils/controlMessages'

interface TestMethods {
    foo(value: string): void
}

class TestSocketAdapter extends AbstractSocketAdapter<TestMethods, TestMethods> {
    readonly send = vi.fn<(message: object) => void>()
    readonly messageHandlerMock = vi.fn<MessageHandler>()
    readonly connectionLostHandlerMock = vi.fn<ConnectionLostHandler>()

    constructor(heartbeatOptions?: HeartbeatOptions) {
        super(heartbeatOptions)
        this.messageHandler = this.messageHandlerMock
        this.connectionLostHandler = this.connectionLostHandlerMock
        this.initLogger(LogLevel.DEBUG)
    }

    connect = vi.fn<() => void>()

    open(): void {
        this.opened()
    }

    closeTransport(): void {
        this.closed()
    }

    deliver(data: string | object): void {
        this.receive(data)
    }
}

const request: RpcRequest<TestMethods> = { jsonrpc: '2.0', id: 'request-id', method: 'foo', params: ['bar'] }
const ping = createControlMessage(ControlMethod.PING)
const pong = createControlMessage(ControlMethod.PONG)
const goodbye = createControlMessage(ControlMethod.GOODBYE)

describe(AbstractSocketAdapter, () => {
    let adapter: TestSocketAdapter

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        adapter = new TestSocketAdapter()
    })

    afterEach(() => {
        adapter.destroy()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('connection state', () => {
        it('should connect once the transport is open', () => {
            adapter.open()

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should close the connection once the transport is closed', () => {
            adapter.open()

            adapter.closeTransport()

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(adapter.connectionLostHandlerMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('sending', () => {
        it('should pass RPC messages to the transport', () => {
            adapter.sendMessage(request)

            expect(adapter.send).toHaveBeenCalledWith(request)
        })
    })

    describe('receiving', () => {
        beforeEach(() => {
            adapter.open()
        })

        it('should forward objects', () => {
            adapter.deliver(request)

            expect(adapter.messageHandlerMock).toHaveBeenCalledWith(request)
        })

        it('should forward JSON objects once parsed', () => {
            adapter.deliver(JSON.stringify(request))

            expect(adapter.messageHandlerMock).toHaveBeenCalledWith(request)
        })

        it.each(['not json', '5'])('should forward %j unparsed so the channel can answer it', (data) => {
            adapter.deliver(data)

            expect(adapter.messageHandlerMock).toHaveBeenCalledWith(data)
        })

        it('should ignore messages while the transport is closed', () => {
            adapter.closeTransport()

            adapter.deliver(request)

            expect(adapter.messageHandlerMock).not.toHaveBeenCalled()
            expect(console.log).toHaveBeenCalledWith(
                '[TestSocketAdapter]',
                'Ignored a message that arrived while the connection was closed',
            )
        })
    })

    describe('control messages', () => {
        it('should answer a ping with a pong and not forward it', () => {
            adapter.open()

            adapter.deliver(JSON.stringify(ping))

            expect(adapter.send).toHaveBeenCalledWith(pong)
            expect(adapter.messageHandlerMock).not.toHaveBeenCalled()
        })

        it('should close the connection when the remote side says goodbye', () => {
            adapter.open()

            adapter.deliver(goodbye)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(adapter.connectionLostHandlerMock).toHaveBeenCalledTimes(1)
        })

        it('should say goodbye when destroyed while open', () => {
            adapter.open()

            adapter.destroy()

            expect(adapter.send).toHaveBeenCalledWith(goodbye)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should not send control messages while closed', () => {
            adapter.destroy()

            expect(adapter.send).not.toHaveBeenCalled()
        })
    })

    describe('heartbeat', () => {
        beforeEach(() => {
            vi.useFakeTimers()
            adapter = new TestSocketAdapter({ interval: 1000, timeout: 3000 })
            adapter.open()
        })

        it('should ping once per interval', () => {
            vi.advanceTimersByTime(2000)

            expect(adapter.send).toHaveBeenCalledTimes(2)
            expect(adapter.send).toHaveBeenCalledWith(ping)
        })

        it('should report the remote side as disconnected once when it does not answer in time', () => {
            vi.advanceTimersByTime(8000)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(adapter.connectionLostHandlerMock).not.toHaveBeenCalled()
            expect(console.warn).toHaveBeenCalledExactlyOnceWith(
                '[TestSocketAdapter]',
                'The remote side did not answer the heartbeat in time',
            )
        })

        it('should report the remote side as connected again once it answers', () => {
            vi.advanceTimersByTime(4000)

            adapter.deliver(pong)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
            expect(console.log).toHaveBeenCalledWith('[TestSocketAdapter]', 'The remote side is responding again')
        })

        it('should keep the status when a pong arrives while connected', () => {
            adapter.deliver(pong)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should stop pinging once the transport is closed', () => {
            adapter.closeTransport()
            vi.advanceTimersByTime(5000)

            expect(adapter.send).not.toHaveBeenCalled()
        })
    })
})
