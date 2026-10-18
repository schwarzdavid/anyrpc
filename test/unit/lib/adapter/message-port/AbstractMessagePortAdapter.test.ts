import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AbstractMessagePortAdapter, type MessagePorts } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'
import type { HeartbeatOptions } from '@/lib/Heartbeat'
import type { ConnectionHandler, ConnectionLostHandler, MessageHandler } from '@/lib/adapter/AbstractRpcAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { RpcRequest } from '@/types/RpcMessages'
import { nextMessage } from '../../../__helper/nextMessage'

interface TestMethods {
    foo(value: string): void
}

class TestAdapter extends AbstractMessagePortAdapter<TestMethods, TestMethods> {
    readonly messageHandlerMock = vi.fn<MessageHandler>()
    readonly connectionHandlerMock = vi.fn<ConnectionHandler>()
    readonly connectionLostHandlerMock = vi.fn<ConnectionLostHandler>()
    readonly onRemoteGoodbyeSpy = vi.fn<() => void>()

    constructor(heartbeatOptions?: HeartbeatOptions) {
        super(heartbeatOptions)
        this.messageHandler = this.messageHandlerMock
        this.connectionHandler = this.connectionHandlerMock
        this.connectionLostHandler = this.connectionLostHandlerMock
        this.initLogger(LogLevel.DEBUG)
    }

    connect = vi.fn<() => void>()

    attach(ports: MessagePorts, options?: { awaitRemote: boolean }) {
        this.attachPorts(ports, options)
    }

    protected override onRemoteGoodbye(): void {
        this.onRemoteGoodbyeSpy()
        super.onRemoteGoodbye()
    }
}

const request: RpcRequest<TestMethods> = { jsonrpc: '2.0', id: 'request-id', method: 'foo', params: ['bar'] }

describe(AbstractMessagePortAdapter, () => {
    let dataChannel: MessageChannel
    let controlChannel: MessageChannel
    let adapter: TestAdapter

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        dataChannel = new MessageChannel()
        controlChannel = new MessageChannel()
        adapter = new TestAdapter()
    })

    afterEach(() => {
        adapter.destroy()
        dataChannel.port2.close()
        controlChannel.port2.close()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('without ports', () => {
        it('should be disconnected', () => {
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should silently drop messages', () => {
            expect(() => adapter.sendMessage(request)).not.toThrowError()
        })
    })

    describe('data port', () => {
        it('should connect when ports are attached', () => {
            adapter.attach({ data: dataChannel.port1 })

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
            expect(adapter.connectionHandlerMock).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)
            expect(adapter.connectionLostHandlerMock).not.toHaveBeenCalled()
        })

        it('should report the previous connection as lost when ports are replaced', () => {
            adapter.attach({ data: dataChannel.port1 })

            adapter.attach({ data: new MessageChannel().port1 })

            expect(adapter.connectionLostHandlerMock).toHaveBeenCalledTimes(1)
            expect(adapter.connectionHandlerMock.mock.calls).toStrictEqual([
                [ConnectionStatus.CONNECTED],
                [ConnectionStatus.DISCONNECTED],
                [ConnectionStatus.CONNECTED],
            ])
        })

        it('should send messages through the data port', async () => {
            adapter.attach({ data: dataChannel.port1 })

            const received = nextMessage(dataChannel.port2)
            adapter.sendMessage(request)

            await expect(received).resolves.toStrictEqual(request)
        })

        it('should forward incoming messages to the message handler', async () => {
            adapter.attach({ data: dataChannel.port1 })

            dataChannel.port2.postMessage(request)

            await vi.waitFor(() => expect(adapter.messageHandlerMock).toHaveBeenCalledWith(request))
        })

        it('should log messages that cannot be deserialized', () => {
            const port = dataChannel.port1
            const addEventListenerSpy = vi.spyOn(port, 'addEventListener')
            adapter.attach({ data: port })

            const [, onMessageError] = addEventListenerSpy.mock.calls.find(([type]) => type === 'messageerror')!
            ;(onMessageError as () => void)()

            expect(console.warn).toHaveBeenCalledWith(
                '[TestAdapter]',
                'Dropped a message that could not be deserialized',
            )
        })

        it('should close previously attached ports when new ports are attached', () => {
            const previousData = dataChannel.port1
            const previousControl = controlChannel.port1
            const closeDataSpy = vi.spyOn(previousData, 'close')
            const closeControlSpy = vi.spyOn(previousControl, 'close')
            adapter.attach({ data: previousData, control: previousControl })

            adapter.attach({ data: new MessageChannel().port1 })

            expect(closeDataSpy).toHaveBeenCalledWith()
            expect(closeControlSpy).toHaveBeenCalledWith()
        })
    })

    describe('control port', () => {
        it('should answer pings with pongs', async () => {
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })

            const received = nextMessage(controlChannel.port2)
            controlChannel.port2.postMessage({ jsonrpc: '2.0', method: 'anyrpc::ping', params: [] })

            await expect(received).resolves.toStrictEqual({ jsonrpc: '2.0', method: 'anyrpc::pong', params: [] })
        })

        it('should disconnect and close the ports when the remote side says goodbye', async () => {
            const closeSpy = vi.spyOn(dataChannel.port1, 'close')
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })

            controlChannel.port2.postMessage({ jsonrpc: '2.0', method: 'anyrpc::goodbye', params: [] })

            await vi.waitFor(() => expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED))

            expect(adapter.onRemoteGoodbyeSpy).toHaveBeenCalledTimes(1)
            expect(adapter.connectionLostHandlerMock).toHaveBeenCalledTimes(1)
            expect(closeSpy).toHaveBeenCalledWith()
        })

        it('should warn about unknown control messages', async () => {
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })

            controlChannel.port2.postMessage({ jsonrpc: '2.0', method: 'anyrpc::unknown', params: [] })

            await vi.waitFor(() =>
                expect(console.warn).toHaveBeenCalledWith('[TestAdapter]', 'Ignored an unknown control message', {
                    jsonrpc: '2.0',
                    method: 'anyrpc::unknown',
                    params: [],
                }),
            )

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should ping the remote side and stay disconnected when attaching with awaitRemote', async () => {
            const received = nextMessage(controlChannel.port2)

            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 }, { awaitRemote: true })

            await expect(received).resolves.toStrictEqual({ jsonrpc: '2.0', method: 'anyrpc::ping', params: [] })
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(adapter.connectionHandlerMock).not.toHaveBeenCalled()
        })

        it('should connect once the remote side answers the ping after attaching with awaitRemote', async () => {
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 }, { awaitRemote: true })

            controlChannel.port2.postMessage({ jsonrpc: '2.0', method: 'anyrpc::pong', params: [] })

            await vi.waitFor(() => expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED))

            expect(adapter.connectionLostHandlerMock).not.toHaveBeenCalled()
            expect(console.log).toHaveBeenCalledWith('[TestAdapter]', 'The remote side accepted the connection')
        })

        it('should not change the status when a pong arrives while connected', async () => {
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })
            adapter.connectionHandlerMock.mockClear()

            const pongAnswer = nextMessage(controlChannel.port2)
            controlChannel.port2.postMessage({ jsonrpc: '2.0', method: 'anyrpc::pong', params: [] })
            controlChannel.port2.postMessage({ jsonrpc: '2.0', method: 'anyrpc::ping', params: [] })
            await pongAnswer

            expect(adapter.connectionHandlerMock).not.toHaveBeenCalled()
        })
    })

    describe('destroy', () => {
        it('should say goodbye to the remote side and close the ports', async () => {
            const closeDataSpy = vi.spyOn(dataChannel.port1, 'close')
            const closeControlSpy = vi.spyOn(controlChannel.port1, 'close')
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })

            const received = nextMessage(controlChannel.port2)
            adapter.destroy()

            await expect(received).resolves.toStrictEqual({ jsonrpc: '2.0', method: 'anyrpc::goodbye', params: [] })
            expect(closeDataSpy).toHaveBeenCalledWith()
            expect(closeControlSpy).toHaveBeenCalledWith()
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(adapter.connectionLostHandlerMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('heartbeat', () => {
        const heartbeatOptions: HeartbeatOptions = { interval: 100, timeout: 250 }

        function pingMessages(port: MessagePort): unknown[] {
            const messages: unknown[] = []
            port.addEventListener('message', (event) => messages.push(event.data))
            port.start()
            return messages
        }

        it('should not ping without a control port', () => {
            vi.useFakeTimers()
            adapter = new TestAdapter(heartbeatOptions)
            const postMessageSpy = vi.spyOn(controlChannel.port1, 'postMessage')
            adapter.attach({ data: dataChannel.port1 })

            vi.advanceTimersByTime(1000)

            expect(postMessageSpy).not.toHaveBeenCalled()
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should ping the remote side through the control port', async () => {
            adapter = new TestAdapter(heartbeatOptions)
            const messages = pingMessages(controlChannel.port2)
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })

            await vi.waitFor(() =>
                expect(messages).toContainEqual({ jsonrpc: '2.0', method: 'anyrpc::ping', params: [] }),
            )
        })

        it('should disconnect when the remote side does not answer in time', () => {
            vi.useFakeTimers()
            adapter = new TestAdapter(heartbeatOptions)
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })

            vi.advanceTimersByTime(350)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(console.warn).toHaveBeenCalledWith(
                '[TestAdapter]',
                'The remote side did not answer the heartbeat in time',
            )
        })

        it('should not report the connection as lost while the remote side is only unresponsive', () => {
            vi.useFakeTimers()
            adapter = new TestAdapter(heartbeatOptions)
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })

            vi.advanceTimersByTime(350)

            expect(adapter.connectionLostHandlerMock).not.toHaveBeenCalled()
        })

        it('should still deliver messages while the remote side is unresponsive', async () => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
            adapter = new TestAdapter(heartbeatOptions)
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })
            vi.advanceTimersByTime(350)

            dataChannel.port2.postMessage(request)

            await vi.waitFor(() => expect(adapter.messageHandlerMock).toHaveBeenCalledWith(request))
        })

        it('should report the disconnect only once when the remote side says goodbye after a timeout', async () => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
            adapter = new TestAdapter(heartbeatOptions)
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })
            adapter.connectionHandlerMock.mockClear()
            vi.advanceTimersByTime(350)

            controlChannel.port2.postMessage({ jsonrpc: '2.0', method: 'anyrpc::goodbye', params: [] })

            await vi.waitFor(() => expect(adapter.connectionLostHandlerMock).toHaveBeenCalledTimes(1))

            expect(adapter.connectionHandlerMock).toHaveBeenCalledTimes(1)
        })

        it('should report a disconnect only once while the remote side stays unresponsive', () => {
            vi.useFakeTimers()
            adapter = new TestAdapter(heartbeatOptions)
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })
            adapter.connectionHandlerMock.mockClear()

            vi.advanceTimersByTime(2000)

            expect(adapter.connectionHandlerMock).toHaveBeenCalledTimes(1)
        })

        it('should reconnect when the remote side answers again', async () => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
            adapter = new TestAdapter(heartbeatOptions)
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })
            vi.advanceTimersByTime(350)

            controlChannel.port2.postMessage({ jsonrpc: '2.0', method: 'anyrpc::pong', params: [] })

            await vi.waitFor(() => expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED))
        })

        it('should restart the heartbeat for new ports', async () => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
            adapter = new TestAdapter(heartbeatOptions)
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })
            vi.advanceTimersByTime(200)
            const newControlChannel = new MessageChannel()
            const messages = pingMessages(newControlChannel.port2)

            adapter.attach({ data: new MessageChannel().port1, control: newControlChannel.port1 })
            vi.advanceTimersByTime(340)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)

            await vi.waitFor(() =>
                expect(messages).toContainEqual({ jsonrpc: '2.0', method: 'anyrpc::ping', params: [] }),
            )
        })

        it('should stop the heartbeat when destroyed', () => {
            vi.useFakeTimers()
            adapter = new TestAdapter(heartbeatOptions)
            adapter.attach({ data: dataChannel.port1, control: controlChannel.port1 })

            adapter.destroy()
            vi.advanceTimersByTime(1000)

            expect(vi.getTimerCount()).toBe(0)
        })
    })
})
