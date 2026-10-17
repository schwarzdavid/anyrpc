import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import { WebWorkerClientAdapter } from '@/lib/adapter/web-worker/client'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'

interface TestMethods {
    foo(value: string): void
}

vi.mock(import('@/utils/uuid'), () => ({
    uuid: vi.fn<() => string>(() => 'init-id'),
}))

const initResponse = { jsonrpc: '2.0', id: 'init-id', result: null }

function receiveFromParent(data: unknown, ports: MessagePort[] = []) {
    globalThis.dispatchEvent(new MessageEvent('message', { data, ports }))
}

describe(WebWorkerClientAdapter, () => {
    let postMessageSpy: MockInstance
    let dataChannel: MessageChannel
    let controlChannel: MessageChannel
    let adapter: WebWorkerClientAdapter<TestMethods, TestMethods>

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        postMessageSpy = vi.spyOn(globalThis, 'postMessage').mockImplementation(() => undefined)
        dataChannel = new MessageChannel()
        controlChannel = new MessageChannel()
        adapter = new WebWorkerClientAdapter()
        adapter.initLogger(LogLevel.DEBUG)
    })

    afterEach(() => {
        adapter.destroy()
        dataChannel.port2.close()
        controlChannel.port2.close()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('should send an init request with its name to the parent when connecting', () => {
        adapter = new WebWorkerClientAdapter('my-app')

        adapter.connect()

        expect(postMessageSpy).toHaveBeenCalledWith({
            jsonrpc: '2.0',
            id: 'init-id',
            method: 'anyrpc::web-worker-init',
            params: ['my-app'],
        })
    })

    it('should use the configured polling interval', () => {
        adapter = new WebWorkerClientAdapter(undefined, { pollingInterval: 100 })

        adapter.connect()
        vi.advanceTimersByTime(300)

        expect(postMessageSpy).toHaveBeenCalledTimes(4)
    })

    it('should connect with the ports of the init response from the parent', async () => {
        adapter.connect()

        receiveFromParent(initResponse, [dataChannel.port1, controlChannel.port1])

        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)

        const received = new Promise((resolve) => dataChannel.port2.addEventListener('message', resolve))
        dataChannel.port2.start()
        adapter.sendMessage({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })

        await expect(received).resolves.toMatchObject({ data: { method: 'foo', params: ['bar'] } })
    })

    it('should ignore unrelated messages from the parent', () => {
        adapter.connect()

        receiveFromParent({ type: 'progress' }, [dataChannel.port1, controlChannel.port1])

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should not listen twice when connecting twice', () => {
        adapter.connect()
        adapter.connect()
        const connectionHandler = vi.fn<(status: ConnectionStatus) => void>()
        adapter.connectionHandler = connectionHandler

        receiveFromParent(initResponse, [dataChannel.port1, controlChannel.port1])

        expect(connectionHandler).toHaveBeenCalledTimes(1)
    })

    it('should stop listening to the parent when destroyed', () => {
        adapter.connect()

        adapter.destroy()
        vi.advanceTimersByTime(3000)
        receiveFromParent(initResponse, [dataChannel.port1, controlChannel.port1])

        expect(postMessageSpy).toHaveBeenCalledTimes(1)
        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })
})
