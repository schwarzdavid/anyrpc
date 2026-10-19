import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import { stubGlobalScope } from '../../../__helper/stubGlobalScope'
import { WebWorkerClientAdapter } from '@/lib/adapter/web-worker'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import { ControlMethod, createControlMessage } from '@/lib/adapter/message-port/utils/controlMessages'
import { confirmHandshake } from '../../../__helper/confirmHandshake'

interface TestMethods {
    foo(value: string): void
}

function initRequest(id = 'init-id', name = 'anyrpc-web-worker-adapter') {
    return { jsonrpc: '2.0', id, method: 'anyrpc::web-worker-init', params: [name] }
}

function receiveFromPage(data: unknown) {
    globalThis.dispatchEvent(new MessageEvent('message', { data }))
}

describe(WebWorkerClientAdapter, () => {
    let postMessageSpy: MockInstance
    let adapter: WebWorkerClientAdapter<TestMethods, TestMethods>

    beforeEach(() => {
        vi.stubGlobal('window', undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        postMessageSpy = vi.spyOn(globalThis, 'postMessage').mockImplementation(() => undefined)
        adapter = new WebWorkerClientAdapter()
        adapter.initLogger(LogLevel.DEBUG)
    })

    afterEach(() => {
        adapter.destroy()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('should refuse to be created outside of a web worker', () => {
        vi.stubGlobal('window', globalThis)

        expect(() => new WebWorkerClientAdapter()).toThrowError(
            'WebWorkerClientAdapter must be created inside the web worker. ' +
                'Use WebWorkerHostAdapter on the page that starts the worker.',
        )
    })

    it.each([
        ['SharedWorkerGlobalScope', 'In a shared worker, use SharedWorkerHubAdapter with createRpcHub.'],
        ['ServiceWorkerGlobalScope', 'not in service workers.'],
    ] as const)('should refuse to be created in a %s', (scope, hint) => {
        stubGlobalScope(scope)

        expect(() => new WebWorkerClientAdapter()).toThrowError(hint)
    })

    function answeredControlPort(call = 0): MessagePort {
        const [, { transfer }] = postMessageSpy.mock.calls[call] as [unknown, { transfer: MessagePort[] }]
        return transfer[1]!
    }

    it('should answer the init request of the page with a data and a control port', () => {
        adapter.connect()

        receiveFromPage(initRequest())

        expect(postMessageSpy).toHaveBeenCalledExactlyOnceWith(
            { jsonrpc: '2.0', id: 'init-id', result: null },
            { transfer: [expect.any(MessagePort), expect.any(MessagePort)] },
        )
    })

    it('should connect once the page answers the handshake ping', async () => {
        adapter.connect()
        receiveFromPage(initRequest())

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)

        await confirmHandshake(answeredControlPort())

        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
    })

    it('should only answer init requests with a matching name', () => {
        adapter = new WebWorkerClientAdapter('my-app')
        adapter.connect()

        receiveFromPage(initRequest('init-id', 'other-app'))
        receiveFromPage({ type: 'progress' })

        expect(postMessageSpy).not.toHaveBeenCalled()
    })

    it('should answer a repeated init request only once', () => {
        adapter.connect()

        receiveFromPage(initRequest())
        receiveFromPage(initRequest())

        expect(postMessageSpy).toHaveBeenCalledTimes(1)
        expect(console.log).toHaveBeenCalledWith(
            '[WebWorkerClientAdapter]',
            'Ignored a repeated handshake request that was already answered',
        )
    })

    it('should answer a new handshake after the page said goodbye', async () => {
        adapter.connect()
        receiveFromPage(initRequest())
        const controlPort = answeredControlPort()
        await confirmHandshake(controlPort)

        controlPort.postMessage(createControlMessage(ControlMethod.GOODBYE))
        await vi.waitFor(() => expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED))
        receiveFromPage(initRequest('next-id'))

        expect(postMessageSpy).toHaveBeenCalledTimes(2)
    })

    it('should not listen twice when connecting twice', () => {
        adapter.connect()
        adapter.connect()

        receiveFromPage(initRequest())

        expect(postMessageSpy).toHaveBeenCalledTimes(1)
    })

    it('should stop listening to the page when destroyed', () => {
        adapter.connect()

        adapter.destroy()
        receiveFromPage(initRequest())

        expect(postMessageSpy).not.toHaveBeenCalled()
        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
    })
})
