import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IFrameClientAdapter, type IFrameClientAdapterOptions, type IFrameOriginOption } from '@/lib/adapter/iframe'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'

interface TestMethods {
    foo(value: string): void
}

vi.mock(import('@/utils/uuid'), () => ({
    uuid: vi.fn<() => string>(() => 'init-id'),
}))

const PARENT_ORIGIN = 'https://example.com'

const initResponse = { jsonrpc: '2.0', id: 'init-id', result: null }

type PostMessageMock = ReturnType<typeof vi.fn<(message: unknown, targetOrigin: string) => void>>

const originCases: [description: string, origin: IFrameOriginOption, eventOrigin: string, connects: boolean][] = [
    ['a matching string', PARENT_ORIGIN, PARENT_ORIGIN, true],
    ['a string with different casing', ' HTTPS://Example.com ', PARENT_ORIGIN, true],
    ['a string with a trailing slash', 'https://example.com/', PARENT_ORIGIN, true],
    ['a string with the default port', 'https://example.com:443', PARENT_ORIGIN, true],
    ['a string with another scheme', 'http://example.com', PARENT_ORIGIN, false],
    ['a string with another host', 'https://examples.com', PARENT_ORIGIN, false],
    ['a matching regex', /^https:\/\/.*\.com$/u, PARENT_ORIGIN, true],
    ['a regex that does not match', /^https:\/\/.*\.at$/u, PARENT_ORIGIN, false],
    ['an array containing the origin', ['https://example.at', PARENT_ORIGIN], PARENT_ORIGIN, true],
    ['an array containing a matching regex', ['https://example.at', /\.cloud$/u], 'https://test.cloud', true],
    ['an array without a match', ['https://example.at', /\.cloud$/u], PARENT_ORIGIN, false],
    ['a function returning true', () => true, PARENT_ORIGIN, true],
    ['a function returning false', () => false, PARENT_ORIGIN, false],
]

describe(IFrameClientAdapter, () => {
    let parentWindow: Window & { postMessage: PostMessageMock }
    let dataChannel: MessageChannel
    let controlChannel: MessageChannel
    let adapter: IFrameClientAdapter<TestMethods, TestMethods>

    function receiveFromParent(
        data: unknown,
        { origin = PARENT_ORIGIN, source = parentWindow as MessageEventSource, ports = [] as MessagePort[] } = {},
    ) {
        window.dispatchEvent(new MessageEvent('message', { data, origin, source, ports }))
    }

    function receiveInitResponse(options?: Parameters<typeof receiveFromParent>[1]) {
        receiveFromParent(initResponse, { ports: [dataChannel.port1, controlChannel.port1], ...options })
    }

    function createAdapter(options?: Partial<IFrameClientAdapterOptions>) {
        adapter = new IFrameClientAdapter(undefined, options)
        adapter.initLogger(LogLevel.DEBUG)
        return adapter
    }

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        parentWindow = {
            postMessage: vi.fn<(message: unknown, targetOrigin: string) => void>(),
        } as unknown as typeof parentWindow
        vi.stubGlobal('parent', parentWindow)
        dataChannel = new MessageChannel()
        controlChannel = new MessageChannel()
        createAdapter()
    })

    afterEach(() => {
        adapter.destroy()
        dataChannel.port2.close()
        controlChannel.port2.close()
        vi.unstubAllGlobals()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('handshake', () => {
        it('should post an init request with its name to the parent window when connecting', () => {
            adapter = new IFrameClientAdapter('my-app')

            adapter.connect()

            expect(parentWindow.postMessage).toHaveBeenCalledWith(
                { jsonrpc: '2.0', id: 'init-id', method: 'anyrpc::iframe-init', params: ['my-app'] },
                '*',
            )
        })

        it('should use the configured polling interval', () => {
            createAdapter({ pollingInterval: 100 })

            adapter.connect()
            vi.advanceTimersByTime(300)

            expect(parentWindow.postMessage).toHaveBeenCalledTimes(4)
        })

        it('should connect with the ports of the init response from the parent window', async () => {
            adapter.connect()

            receiveInitResponse()

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)

            const received = new Promise((resolve) => dataChannel.port2.addEventListener('message', resolve))
            dataChannel.port2.start()
            adapter.sendMessage({ jsonrpc: '2.0', method: 'foo', params: ['bar'] })

            await expect(received).resolves.toMatchObject({ data: { method: 'foo', params: ['bar'] } })
        })

        it('should ignore responses from other sources than the parent window', () => {
            adapter.connect()

            receiveInitResponse({ source: {} as Window })

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should ignore unrelated messages from the parent window', () => {
            adapter.connect()

            receiveFromParent({ type: 'resize' })

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should not listen twice when connecting twice', () => {
            adapter.connect()
            adapter.connect()
            const connectionHandler = vi.fn<(status: ConnectionStatus) => void>()
            adapter.connectionHandler = connectionHandler

            receiveInitResponse()

            expect(connectionHandler).toHaveBeenCalledTimes(1)
        })

        it('should warn if the page is not embedded in an iframe', () => {
            vi.stubGlobal('parent', window)

            adapter.connect()

            expect(console.warn).toHaveBeenCalledWith(
                '[IFrameClientAdapter]',
                expect.stringContaining('not embedded in an iframe'),
            )
        })

        it('should connect again after it was destroyed', () => {
            adapter.connect()
            receiveInitResponse()
            adapter.destroy()

            adapter.connect()
            receiveInitResponse({ ports: [new MessageChannel().port1, new MessageChannel().port1] })

            expect(parentWindow.postMessage).toHaveBeenCalledTimes(2)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
        })
    })

    describe('origin option', () => {
        it('should throw for an empty array', () => {
            expect(() => new IFrameClientAdapter(undefined, { origin: [] })).toThrowError(
                'Origin option cannot be an empty array',
            )
        })

        it('should accept any origin by default and warn about it', () => {
            adapter.connect()

            receiveInitResponse({ origin: 'https://evil.example' })

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
            expect(console.warn).toHaveBeenCalledWith('[IFrameClientAdapter]', expect.stringContaining('any origin'))
        })

        it('should accept any origin with the wildcard and warn about it', () => {
            createAdapter({ origin: '*' })
            adapter.connect()

            receiveInitResponse({ origin: 'https://evil.example' })

            expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
            expect(console.warn).toHaveBeenCalledWith('[IFrameClientAdapter]', expect.stringContaining('any origin'))
        })

        it('should not warn when an origin is configured', () => {
            createAdapter({ origin: PARENT_ORIGIN })

            adapter.connect()

            expect(console.warn).not.toHaveBeenCalled()
        })

        it('should check the origin of the response event', () => {
            const originCheck = vi.fn<(origin: string) => boolean>(() => false)
            createAdapter({ origin: originCheck })
            adapter.connect()

            receiveInitResponse({ origin: 'https://other.example' })

            expect(originCheck).toHaveBeenCalledWith('https://other.example')
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should warn about handshake responses from a disallowed origin', () => {
            createAdapter({ origin: PARENT_ORIGIN })
            adapter.connect()

            receiveInitResponse({ origin: 'https://other.example' })

            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(console.warn).toHaveBeenCalledWith(
                '[IFrameClientAdapter]',
                'Ignored the handshake response from "https://other.example": origin not allowed',
            )
        })

        it('should not warn about unrelated messages from a disallowed origin', () => {
            createAdapter({ origin: PARENT_ORIGIN })
            adapter.connect()

            receiveFromParent({ type: 'resize' }, { origin: 'https://other.example' })

            expect(console.warn).not.toHaveBeenCalled()
        })

        it.each(originCases)('should handle %s', (_, origin, eventOrigin, connects) => {
            createAdapter({ origin })
            adapter.connect()

            receiveInitResponse({ origin: eventOrigin })

            expect(adapter.connectionStatus).toBe(connects ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED)
        })
    })

    describe('destroy', () => {
        it('should stop listening to the parent window', () => {
            adapter.connect()

            adapter.destroy()
            vi.advanceTimersByTime(3000)
            receiveInitResponse()

            expect(parentWindow.postMessage).toHaveBeenCalledTimes(1)
            expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })
    })
})
