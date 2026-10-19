import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IFrameHostAdapter, type IFrameHostAdapterOptions, type IFrameOriginOption } from '@/lib/adapter/iframe'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import { confirmHandshake } from '../../../__helper/confirmHandshake'

interface TestMethods {
    foo(value: string): void
}

const IFRAME_ORIGIN = 'https://iframe.example'

function initRequest(id = 'init-id', name = 'anyrpc-iframe-adapter') {
    return { jsonrpc: '2.0', id, method: 'anyrpc::iframe-init', params: [name] }
}

type PostMessageMock = ReturnType<
    typeof vi.fn<(message: unknown, targetOrigin: string, transfer?: Transferable[]) => void>
>

const originCases: [description: string, origin: IFrameOriginOption, answers: boolean][] = [
    ['a matching string', IFRAME_ORIGIN, true],
    ['a string with a trailing slash', `${IFRAME_ORIGIN}/`, true],
    ['a string with another host', 'https://other.example', false],
    ['a matching regex', /\.example$/u, true],
    ['a function returning false', () => false, false],
]

describe(IFrameHostAdapter, () => {
    let iframe: HTMLIFrameElement
    let contentWindow: Window & { postMessage: PostMessageMock }
    let adapter: IFrameHostAdapter<TestMethods, TestMethods>

    function receiveFromIframe(
        data: unknown,
        { source = contentWindow as MessageEventSource, origin = IFRAME_ORIGIN } = {},
    ) {
        window.dispatchEvent(new MessageEvent('message', { data, source, origin }))
    }

    function createAdapter(options?: Partial<IFrameHostAdapterOptions>, name?: string) {
        adapter = new IFrameHostAdapter(iframe, name, options)
        adapter.initLogger(LogLevel.DEBUG)
        return adapter
    }

    function transferredPorts(call = 0): [MessagePort, MessagePort] {
        return contentWindow.postMessage.mock.calls[call]![2] as [MessagePort, MessagePort]
    }

    function confirmFromIframe(call = 0): Promise<void> {
        return confirmHandshake(transferredPorts(call)[1])
    }

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        iframe = document.createElement('iframe')
        contentWindow = {
            postMessage: vi.fn<(message: unknown, targetOrigin: string, transfer?: Transferable[]) => void>(),
        } as unknown as typeof contentWindow
        Object.defineProperty(iframe, 'contentWindow', { value: contentWindow })
        createAdapter()
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
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should connect once the iframe answers through the control port', async () => {
            adapter.connect()

            receiveFromIframe(initRequest())
            await confirmFromIframe()

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should post the response to any origin', () => {
            adapter.connect()

            receiveFromIframe(initRequest())

            expect(contentWindow.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'init-id' }),
                '*',
                expect.any(Array),
            )
        })

        it('should only answer init requests with a matching name', () => {
            createAdapter(undefined, 'my-app')
            adapter.connect()

            receiveFromIframe(initRequest('init-id', 'other-app'))

            expect(contentWindow.postMessage).not.toHaveBeenCalled()

            receiveFromIframe(initRequest('init-id', 'my-app'))

            expect(contentWindow.postMessage).toHaveBeenCalledTimes(1)
        })

        it('should ignore messages from other sources than the iframe', () => {
            adapter.connect()

            receiveFromIframe(initRequest(), { source: {} as Window })

            expect(contentWindow.postMessage).not.toHaveBeenCalled()
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should ignore messages of the iframe that are no init requests', () => {
            adapter.connect()

            receiveFromIframe('im a gummy bear')
            receiveFromIframe({ jsonrpc: '2.0', id: 'init-id', method: 'foo', params: ['bar'] })

            expect(contentWindow.postMessage).not.toHaveBeenCalled()
        })

        it('should answer a new handshake after the iframe reloaded by default', async () => {
            adapter.connect()
            receiveFromIframe(initRequest('first-id'))
            await confirmFromIframe(0)

            receiveFromIframe(initRequest('second-id'))
            await confirmFromIframe(1)

            expect(contentWindow.postMessage).toHaveBeenCalledTimes(2)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should stop listening after the first handshake if reconnect is disabled', () => {
            createAdapter({ reconnect: false })
            adapter.connect()
            receiveFromIframe(initRequest('first-id'))

            receiveFromIframe(initRequest('second-id'))

            expect(contentWindow.postMessage).toHaveBeenCalledTimes(1)
        })

        it('should keep listening after ignoring a foreign init request if reconnect is disabled', async () => {
            createAdapter({ reconnect: false }, 'my-app')
            adapter.connect()

            receiveFromIframe(initRequest('init-id', 'other-app'))
            receiveFromIframe(initRequest('init-id', 'my-app'))
            await confirmFromIframe()

            expect(contentWindow.postMessage).toHaveBeenCalledTimes(1)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should answer handshakes again after it was destroyed and reconnected', async () => {
            adapter.connect()
            receiveFromIframe(initRequest('first-id'))
            adapter.destroy()

            adapter.connect()
            receiveFromIframe(initRequest('second-id'))
            await confirmFromIframe(1)

            expect(contentWindow.postMessage).toHaveBeenCalledTimes(2)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })
    })

    describe('origin option', () => {
        it('should throw for an empty array', () => {
            expect(() => new IFrameHostAdapter(iframe, undefined, { origin: [] })).toThrowError(
                'Origin option cannot be an empty array',
            )
        })

        it('should accept any origin by default without a warning', async () => {
            adapter.connect()

            receiveFromIframe(initRequest(), { origin: 'https://evil.example' })
            await confirmFromIframe()

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
            expect(console.warn).not.toHaveBeenCalled()
        })

        it('should ignore init requests from a disallowed origin and warn about it', () => {
            createAdapter({ origin: IFRAME_ORIGIN })
            adapter.connect()

            receiveFromIframe(initRequest(), { origin: 'https://other.example' })

            expect(contentWindow.postMessage).not.toHaveBeenCalled()
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(console.warn).toHaveBeenCalledWith(
                '[IFrameHostAdapter]',
                'Ignored the handshake request from "https://other.example": origin not allowed',
            )
        })

        it('should not warn about unrelated messages from a disallowed origin', () => {
            createAdapter({ origin: IFRAME_ORIGIN })
            adapter.connect()

            receiveFromIframe({ type: 'resize' }, { origin: 'https://other.example' })

            expect(console.warn).not.toHaveBeenCalled()
        })

        it.each(originCases)('should handle %s', (_, origin, answers) => {
            createAdapter({ origin })
            adapter.connect()

            receiveFromIframe(initRequest())

            expect(contentWindow.postMessage).toHaveBeenCalledTimes(answers ? 1 : 0)
        })
    })

    describe('heartbeat', () => {
        it('should be disabled by default', async () => {
            vi.useFakeTimers()
            adapter.connect()
            receiveFromIframe(initRequest())
            await confirmFromIframe()

            vi.advanceTimersByTime(60_000)

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })

        it('should ping the iframe through the control port when enabled', async () => {
            createAdapter({ heartbeat: { interval: 10, timeout: 50 } })
            adapter.connect()
            receiveFromIframe(initRequest())
            const [, controlPort] = transferredPorts()
            await confirmFromIframe()

            const received = new Promise((resolve) => {
                controlPort.addEventListener('message', (event) => resolve(event.data), { once: true })
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
