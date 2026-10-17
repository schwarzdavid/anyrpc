import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IFrameHostAdapter } from '@/lib/adapter/iframe'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'

interface TestMethods {
    foo(value: string): void
}

function initRequest(id = 'init-id', name = 'anyrpc-iframe-adapter') {
    return { jsonrpc: '2.0', id, method: 'anyrpc::iframe-init', params: [name] }
}

type PostMessageMock = ReturnType<
    typeof vi.fn<(message: unknown, targetOrigin: string, transfer?: Transferable[]) => void>
>

describe(IFrameHostAdapter, () => {
    let iframe: HTMLIFrameElement
    let contentWindow: Window & { postMessage: PostMessageMock }
    let adapter: IFrameHostAdapter<TestMethods, TestMethods>

    function receiveFromIframe(data: unknown, source: MessageEventSource = contentWindow) {
        window.dispatchEvent(new MessageEvent('message', { data, source }))
    }

    function transferredPorts(call = 0): [MessagePort, MessagePort] {
        return contentWindow.postMessage.mock.calls[call]![2] as [MessagePort, MessagePort]
    }

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        iframe = document.createElement('iframe')
        contentWindow = {
            postMessage: vi.fn<(message: unknown, targetOrigin: string, transfer?: Transferable[]) => void>(),
        } as unknown as typeof contentWindow
        Object.defineProperty(iframe, 'contentWindow', { value: contentWindow })
        adapter = new IFrameHostAdapter(iframe)
        adapter.initLogger(LogLevel.DEBUG)
    })

    afterEach(() => {
        adapter.destroy()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('handshake', () => {
        it('should answer init requests of the iframe with a data and a control port', () => {
            adapter.connect()

            receiveFromIframe(initRequest())

            expect(contentWindow.postMessage).toHaveBeenCalledWith(
                { jsonrpc: '2.0', id: 'init-id', result: null },
                '*',
                [expect.any(MessagePort), expect.any(MessagePort)],
            )
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should post the response to the configured postMessageOrigin', () => {
            adapter = new IFrameHostAdapter(iframe, undefined, { postMessageOrigin: 'https://example.com' })
            adapter.connect()

            receiveFromIframe(initRequest())

            expect(contentWindow.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'init-id' }),
                'https://example.com',
                expect.any(Array),
            )
        })

        it('should only answer init requests with a matching name', () => {
            adapter = new IFrameHostAdapter(iframe, 'my-app')
            adapter.connect()

            receiveFromIframe(initRequest('init-id', 'other-app'))

            expect(contentWindow.postMessage).not.toHaveBeenCalled()

            receiveFromIframe(initRequest('init-id', 'my-app'))

            expect(contentWindow.postMessage).toHaveBeenCalledTimes(1)
        })

        it('should ignore messages from other sources than the iframe', () => {
            adapter.connect()

            receiveFromIframe(initRequest(), {} as Window)

            expect(contentWindow.postMessage).not.toHaveBeenCalled()
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should ignore messages of the iframe that are no init requests', () => {
            adapter.connect()

            receiveFromIframe('im a gummy bear')
            receiveFromIframe({ jsonrpc: '2.0', id: 'init-id', method: 'foo', params: ['bar'] })

            expect(contentWindow.postMessage).not.toHaveBeenCalled()
        })

        it('should answer a new handshake after the iframe reloaded by default', () => {
            adapter.connect()
            receiveFromIframe(initRequest('first-id'))

            receiveFromIframe(initRequest('second-id'))

            expect(contentWindow.postMessage).toHaveBeenCalledTimes(2)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should stop listening after the first handshake if reconnect is disabled', () => {
            adapter = new IFrameHostAdapter(iframe, undefined, { reconnect: false })
            adapter.connect()
            receiveFromIframe(initRequest('first-id'))

            receiveFromIframe(initRequest('second-id'))

            expect(contentWindow.postMessage).toHaveBeenCalledTimes(1)
        })
    })

    describe('heartbeat', () => {
        it('should be disabled by default', () => {
            vi.useFakeTimers()
            adapter.connect()
            receiveFromIframe(initRequest())

            vi.advanceTimersByTime(60_000)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should ping the iframe through the control port when enabled', async () => {
            adapter = new IFrameHostAdapter(iframe, undefined, { heartbeat: { interval: 10, timeout: 50 } })
            adapter.connect()
            receiveFromIframe(initRequest())
            const [, controlPort] = transferredPorts()

            const received = new Promise((resolve) => {
                controlPort.addEventListener('message', (event) => resolve(event.data), { once: true })
                controlPort.start()
            })

            await expect(received).resolves.toStrictEqual({ jsonrpc: '2.0', method: 'anyrpc::ping', params: [] })
        })
    })

    describe('destroy', () => {
        it('should stop answering init requests', () => {
            adapter.connect()

            adapter.destroy()
            receiveFromIframe(initRequest())

            expect(contentWindow.postMessage).not.toHaveBeenCalled()
        })
    })
})
