import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { ChildProcessHostAdapter } from '@/lib/adapter/child-process/ChildProcessHostAdapter'
import type { ConnectionLostHandler, MessageHandler } from '@/lib/adapter/AbstractRpcAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { RpcRequest } from '@/types/RpcMessages'
import { ControlMethod, createControlMessage } from '@/utils/controlMessages'

interface TestMethods {
    foo(value: string): void
}

class FakeChild extends EventEmitter {
    connected = true
    readonly send = vi.fn<(message: unknown, callback: (error: Error | null) => void) => boolean>(() => true)
    readonly kill = vi.fn<() => boolean>(() => true)

    listenerCounts(): Record<'message' | 'exit' | 'disconnect', number> {
        return {
            message: this.listenerCount('message'),
            exit: this.listenerCount('exit'),
            disconnect: this.listenerCount('disconnect'),
        }
    }

    sentMessages(): unknown[] {
        return this.send.mock.calls.map(([envelope]) => (envelope as { message: unknown }).message)
    }

    lastInitRequestId(): unknown {
        const requests = this.sentMessages().filter(
            (message) => (message as { method?: unknown }).method === 'anyrpc::child-process-init',
        )
        return (requests.at(-1) as { id?: unknown } | undefined)?.id
    }

    answerHandshake(name = 'my-app'): void {
        this.emit('message', {
            anyrpc: name,
            message: { jsonrpc: '2.0', id: this.lastInitRequestId(), result: null },
        })
    }

    reply(message: object, name = 'my-app'): void {
        this.emit('message', { anyrpc: name, message })
    }
}

const request: RpcRequest<TestMethods> = { jsonrpc: '2.0', id: 'request-id', method: 'foo', params: ['bar'] }

describe(ChildProcessHostAdapter, () => {
    let child: FakeChild
    let adapter: ChildProcessHostAdapter<TestMethods, TestMethods>
    let messageHandler: Mock<MessageHandler>
    let connectionLostHandler: Mock<ConnectionLostHandler>

    function createAdapter(
        ...args: [name?: string, options?: ConstructorParameters<typeof ChildProcessHostAdapter>[2]]
    ) {
        adapter = new ChildProcessHostAdapter<TestMethods, TestMethods>(child, ...args)
        messageHandler = vi.fn<MessageHandler>()
        connectionLostHandler = vi.fn<ConnectionLostHandler>()
        adapter.messageHandler = messageHandler
        adapter.connectionLostHandler = connectionLostHandler
        adapter.initLogger(LogLevel.DEBUG)
    }

    beforeEach(() => {
        vi.useFakeTimers()
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        child = new FakeChild()
        createAdapter('my-app')
    })

    afterEach(() => {
        adapter.destroy()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('should send a wrapped init request with its name when connecting', () => {
        adapter.connect()

        expect(child.send).toHaveBeenCalledWith(
            {
                anyrpc: 'my-app',
                message: {
                    jsonrpc: '2.0',
                    id: expect.any(String),
                    method: 'anyrpc::child-process-init',
                    params: ['my-app'],
                },
            },
            expect.any(Function),
        )
    })

    it('should log a failed send at debug level instead of throwing', () => {
        const error = new Error('write EPIPE')
        child.send.mockImplementation((_message, callback) => {
            callback(error)
            return false
        })

        expect(() => adapter.connect()).not.toThrowError()
        expect(console.log).toHaveBeenCalledWith(
            '[ChildProcessHostAdapter]',
            'Could not send a message to the child process',
            error,
        )
    })

    it('should not log a successful send', () => {
        child.send.mockImplementation((_message, callback) => {
            callback(null)
            return true
        })

        adapter.connect()

        expect(console.log).not.toHaveBeenCalled()
    })

    it('should poll with the same request until the child answers and then connect', () => {
        adapter.connect()
        vi.advanceTimersByTime(2000)
        child.answerHandshake()
        vi.advanceTimersByTime(2000)

        expect(child.send).toHaveBeenCalledTimes(3)
        expect(new Set(child.sentMessages().map((message) => (message as { id: unknown }).id)).size).toBe(1)
        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
    })

    it('should use the configured polling interval', () => {
        createAdapter('my-app', { pollingInterval: 100 })
        adapter.connect()

        vi.advanceTimersByTime(300)

        expect(child.send).toHaveBeenCalledTimes(4)
    })

    it('should ignore answers to another request, other channels and foreign IPC messages', () => {
        adapter.connect()

        child.reply({ jsonrpc: '2.0', id: 'other-id', result: null })
        child.answerHandshake('other-app')
        child.emit('message', { type: 'ready' })

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        expect(messageHandler).not.toHaveBeenCalled()
    })

    it('should forward RPC messages once connected', () => {
        adapter.connect()
        child.answerHandshake()

        child.reply(request)

        expect(messageHandler).toHaveBeenCalledWith(request)
    })

    it('should not send while the IPC channel is closed', () => {
        adapter.connect()
        child.connected = false

        vi.advanceTimersByTime(3000)

        expect(child.send).toHaveBeenCalledTimes(1)
    })

    it('should give up without polling when connecting to a child whose IPC channel is already closed', () => {
        child.connected = false

        adapter.connect()
        vi.advanceTimersByTime(3000)

        expect(child.send).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
        expect(child.listenerCounts()).toStrictEqual({ message: 0, exit: 0, disconnect: 0 })
        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(console.log).toHaveBeenCalledWith(
            '[ChildProcessHostAdapter]',
            'The IPC channel to the child process is closed, so the channel will not reconnect',
        )
    })

    it('should reject pending calls, stop polling and stop listening when the child disconnects', () => {
        adapter.connect()
        child.answerHandshake()
        child.reply(createControlMessage(ControlMethod.GOODBYE))

        child.connected = false
        child.emit('disconnect')
        vi.advanceTimersByTime(3000)

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        expect(connectionLostHandler).toHaveBeenCalledTimes(2)
        expect(vi.getTimerCount()).toBe(0)
        expect(child.listenerCounts()).toStrictEqual({ message: 0, exit: 0, disconnect: 0 })
        expect(console.log).toHaveBeenCalledWith(
            '[ChildProcessHostAdapter]',
            'The IPC channel to the child process is closed, so the channel will not reconnect',
        )
    })

    it('should handle the exit after a disconnect only once', () => {
        adapter.connect()
        child.answerHandshake()

        child.emit('disconnect')
        child.emit('exit', 0)

        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(console.log).not.toHaveBeenCalledWith(
            '[ChildProcessHostAdapter]',
            'The child process exited with code 0, so the channel will not reconnect',
        )
    })

    it('should reject pending calls and start a new handshake when the child says goodbye', () => {
        adapter.connect()
        child.answerHandshake()
        const firstId = child.lastInitRequestId()

        child.reply(createControlMessage(ControlMethod.GOODBYE))

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(child.lastInitRequestId()).not.toBe(firstId)

        child.answerHandshake()

        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
    })

    it('should disconnect, stop polling and stop listening when the child exits', () => {
        adapter.connect()

        child.emit('exit', 1)
        vi.advanceTimersByTime(3000)

        expect(child.send).toHaveBeenCalledTimes(1)
        expect(child.listenerCounts()).toStrictEqual({ message: 0, exit: 0, disconnect: 0 })
        expect(console.log).toHaveBeenCalledWith(
            '[ChildProcessHostAdapter]',
            'The child process exited with code 1, so the channel will not reconnect',
        )
    })

    it('should reject pending calls when the child exits while connected', () => {
        adapter.connect()
        child.answerHandshake()

        child.emit('exit', null)

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        expect(connectionLostHandler).toHaveBeenCalledWith()
    })

    it('should ping the child when the heartbeat is enabled', () => {
        createAdapter('my-app', { heartbeat: { interval: 1000, timeout: 3000 } })
        adapter.connect()
        child.answerHandshake()

        vi.advanceTimersByTime(1000)

        expect(child.sentMessages().at(-1)).toStrictEqual(createControlMessage(ControlMethod.PING))
    })

    it('should say goodbye when destroyed while connected', () => {
        adapter.connect()
        child.answerHandshake()

        adapter.destroy()

        expect(child.sentMessages().at(-1)).toStrictEqual(createControlMessage(ControlMethod.GOODBYE))
        expect(child.kill).not.toHaveBeenCalled()
    })

    it('should kill the child on destroy when killOnDestroy is set', () => {
        createAdapter('my-app', { killOnDestroy: true })
        adapter.connect()

        adapter.destroy()

        expect(child.kill).toHaveBeenCalledTimes(1)
    })

    it('should not register its listeners twice when connecting twice', () => {
        adapter.connect()
        adapter.connect()

        expect(child.listenerCounts()).toStrictEqual({ message: 1, exit: 1, disconnect: 1 })
    })

    it('should use the default name', () => {
        createAdapter()
        adapter.connect()

        child.answerHandshake('anyrpc-child-process-adapter')

        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
    })
})
