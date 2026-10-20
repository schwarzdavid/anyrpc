import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { ChildProcessClientAdapter } from '@/lib/adapter/child-process/ChildProcessClientAdapter'
import type { ConnectionLostHandler, MessageHandler } from '@/lib/adapter/AbstractRpcAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { RpcRequest } from '@/types/RpcMessages'
import { ControlMethod, createControlMessage } from '@/utils/controlMessages'

interface TestMethods {
    foo(value: string): void
}

const processState = vi.hoisted(() => ({ current: undefined as unknown }))

vi.mock(import('@/lib/adapter/child-process/utils/currentProcess'), async (importOriginal) => ({
    ...(await importOriginal()),
    currentProcess: () => processState.current as never,
}))

class FakeProcess extends EventEmitter {
    connected = true
    readonly send = vi.fn<
        (
            message: unknown,
            sendHandle: undefined,
            options: undefined,
            callback: (error: Error | null) => void,
        ) => boolean
    >(() => true)
}

const initRequest = { jsonrpc: '2.0', id: 'init-1', method: 'anyrpc::child-process-init', params: ['my-app'] }
const request: RpcRequest<TestMethods> = { jsonrpc: '2.0', id: 'request-id', method: 'foo', params: ['bar'] }

describe(ChildProcessClientAdapter, () => {
    let fakeProcess: FakeProcess
    let adapter: ChildProcessClientAdapter<TestMethods, TestMethods>
    let messageHandler: Mock<MessageHandler>
    let connectionLostHandler: Mock<ConnectionLostHandler>

    function createAdapter(name?: string) {
        adapter = name === undefined ? new ChildProcessClientAdapter() : new ChildProcessClientAdapter(name)
        messageHandler = vi.fn<MessageHandler>()
        connectionLostHandler = vi.fn<ConnectionLostHandler>()
        adapter.messageHandler = messageHandler
        adapter.connectionLostHandler = connectionLostHandler
        adapter.initLogger(LogLevel.DEBUG)
    }

    function fromParent(message: object, name = 'my-app'): void {
        fakeProcess.emit('message', { anyrpc: name, message })
    }

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        fakeProcess = new FakeProcess()
        processState.current = fakeProcess
        createAdapter('my-app')
        adapter.connect()
    })

    afterEach(() => {
        adapter.destroy()
        vi.restoreAllMocks()
    })

    it('should throw a helpful error in a process without IPC channel', () => {
        processState.current = Object.assign(new EventEmitter(), { connected: false })

        expect(() => new ChildProcessClientAdapter('my-app')).toThrowError(
            'ChildProcessClientAdapter must be created in a process with an IPC channel, ' +
                'e.g. one started with child_process.fork(). Use ChildProcessHostAdapter in the parent process.',
        )
    })

    it('should answer an init request and connect', () => {
        fromParent(initRequest)

        expect(fakeProcess.send).toHaveBeenCalledWith(
            { anyrpc: 'my-app', message: { jsonrpc: '2.0', id: 'init-1', result: null } },
            undefined,
            undefined,
            expect.any(Function),
        )
        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
    })

    it('should log a failed send at debug level instead of throwing', () => {
        const error = new Error('write EPIPE')
        fakeProcess.send.mockImplementation((_message, _sendHandle, _options, callback) => {
            callback(error)
            return false
        })

        expect(() => fromParent(initRequest)).not.toThrowError()
        expect(console.log).toHaveBeenCalledWith(
            '[ChildProcessClientAdapter]',
            'Could not send a message to the parent process',
            error,
        )
    })

    it('should not log a successful send', () => {
        fakeProcess.send.mockImplementation((_message, _sendHandle, _options, callback) => {
            callback(null)
            return true
        })

        fromParent(initRequest)

        expect(console.log).not.toHaveBeenCalled()
    })

    it('should ignore init requests and messages for another channel', () => {
        fromParent(initRequest, 'other-app')
        fromParent({ ...initRequest, params: ['other-app'] })
        fakeProcess.emit('message', { type: 'ready' })

        expect(fakeProcess.send).not.toHaveBeenCalled()
        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should answer a repeated init request only once', () => {
        fromParent(initRequest)
        fromParent(initRequest)

        expect(fakeProcess.send).toHaveBeenCalledTimes(1)
        expect(console.log).toHaveBeenCalledWith(
            '[ChildProcessClientAdapter]',
            'Ignored a repeated handshake request that was already answered',
        )
    })

    it('should reject stale calls and reconnect when the parent starts a new handshake', () => {
        fromParent(initRequest)

        fromParent({ ...initRequest, id: 'init-2' })

        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        expect(fakeProcess.send).toHaveBeenCalledTimes(2)
    })

    it('should forward RPC messages once connected and ignore them before', () => {
        fromParent(request)
        fromParent(initRequest)
        fromParent(request)

        expect(messageHandler).toHaveBeenCalledExactlyOnceWith(request)
    })

    it('should wrap outgoing messages and not send once the IPC channel is closed', () => {
        fromParent(initRequest)

        adapter.sendMessage(request)
        fakeProcess.connected = false
        adapter.sendMessage(request)

        expect(fakeProcess.send).toHaveBeenLastCalledWith(
            { anyrpc: 'my-app', message: request },
            undefined,
            undefined,
            expect.any(Function),
        )
        expect(fakeProcess.send).toHaveBeenCalledTimes(2)
    })

    it('should close the connection when the parent disconnects', () => {
        fromParent(initRequest)

        fakeProcess.emit('disconnect')

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        expect(connectionLostHandler).toHaveBeenCalledTimes(1)
    })

    it('should say goodbye and stop listening when destroyed', () => {
        fromParent(initRequest)

        adapter.destroy()

        expect(fakeProcess.send).toHaveBeenLastCalledWith(
            { anyrpc: 'my-app', message: createControlMessage(ControlMethod.GOODBYE) },
            undefined,
            undefined,
            expect.any(Function),
        )
        expect(fakeProcess.listenerCount('message')).toBe(0)
        expect(fakeProcess.listenerCount('disconnect')).toBe(0)
    })

    it('should not register its listeners twice when connecting twice', () => {
        adapter.connect()

        expect(fakeProcess.listenerCount('message')).toBe(1)
    })

    it('should use the default name', () => {
        adapter.destroy()
        createAdapter()
        adapter.connect()

        fromParent({ ...initRequest, params: ['anyrpc-child-process-adapter'] }, 'anyrpc-child-process-adapter')

        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
    })
})
