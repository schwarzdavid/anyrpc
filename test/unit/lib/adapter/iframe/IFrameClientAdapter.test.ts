import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IFrameClientAdapter } from '@/lib/adapter/iframe'
import { RpcResponse } from '@/types/RpcMessages'
import { uuid } from '@/utils/uuid'
import { ConnectionStatus } from '@/types/ConnectionStatus'

interface TestMethods {
    exampleMethod: (foo: string, bar: number) => Promise<string>
}

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

const defaultUuid = 'default-uuid'

vi.mock(import('@/utils/uuid'), () => ({
    uuid: vi.fn<() => string>(() => defaultUuid),
}))

describe(IFrameClientAdapter, () => {
    let parentWindowMock: Window
    let portMock: MessagePort
    let adapter: IFrameClientAdapter<TestMethods, TestEvents> | null = null

    beforeEach(() => {
        parentWindowMock = {
            postMessage: vi.fn<(this: void, message: any, targetOrigin: string, transfer?: Transferable[]) => void>(),
            origin: 'https://example.com',
        } as unknown as Window

        portMock = {
            addEventListener: vi.fn<any>(),
            start: vi.fn<any>(),
            close: vi.fn<any>(),
        } as unknown as MessagePort

        vi.stubGlobal('parent', parentWindowMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.resetAllMocks()

        adapter?.destroy()
        adapter = null
    })

    it('should establish a connection with parent window', () => {
        const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const onConnectionHandler = vi.fn<(status: ConnectionStatus) => void>()

        adapter = new IFrameClientAdapter<TestMethods, TestEvents>()
        adapter.connectionHandler = onConnectionHandler

        expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
        expect(parentWindowMock.postMessage).toHaveBeenCalledWith(
            {
                id: defaultUuid,
                method: 'anyrpc::iframe-init',
                params: ['anyrpc-iframe-adapter'],
                jsonrpc: '2.0',
            },
            '*',
        )

        const initResponse: RpcResponse<any> = {
            jsonrpc: '2.0',
            id: defaultUuid,
            result: null,
        }

        globalThis.window.dispatchEvent(
            new MessageEvent('message', { data: initResponse, source: parentWindowMock, ports: [portMock] }),
        )

        expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
        expect(portMock.start).toHaveBeenCalledWith()
        expect(onConnectionHandler).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)
    })

    it('should polling init messages if parent does not respond', () => {
        vi.useFakeTimers()

        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const uuidMock = vi.mocked(uuid)
        for (let i = 1; i <= 10; i++) {
            uuidMock.mockReturnValueOnce(i.toString())
        }

        adapter = new IFrameClientAdapter<TestMethods, TestEvents>()

        vi.advanceTimersByTime(4500)

        expect(parentWindowMock.postMessage).toHaveBeenCalledTimes(5)

        const initResponse: RpcResponse<any> = {
            jsonrpc: '2.0',
            id: '2',
            result: null,
        }

        globalThis.window.dispatchEvent(
            new MessageEvent('message', { data: initResponse, source: parentWindowMock, ports: [portMock] }),
        )

        vi.advanceTimersByTime(5000)

        expect(parentWindowMock.postMessage).toHaveBeenCalledTimes(5)
        expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
    })

    it('should ignore response message if MessagePort is missing', () => {
        vi.useFakeTimers()

        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const onConnectionHandler = vi.fn<(status: ConnectionStatus) => void>()

        adapter = new IFrameClientAdapter<TestMethods, TestEvents>()

        expect(parentWindowMock.postMessage).toHaveBeenCalledWith(
            {
                id: defaultUuid,
                method: 'anyrpc::iframe-init',
                params: ['anyrpc-iframe-adapter'],
                jsonrpc: '2.0',
            },
            '*',
        )

        const initResponse: RpcResponse<any> = {
            jsonrpc: '2.0',
            id: defaultUuid,
            result: null,
        }

        globalThis.window.dispatchEvent(
            new MessageEvent('message', { data: initResponse, source: parentWindowMock, ports: [] }),
        )

        expect(removeEventListenerSpy).not.toHaveBeenCalled()
        expect(onConnectionHandler).not.toHaveBeenCalled()
        expect(parentWindowMock.postMessage).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(4500)

        expect(parentWindowMock.postMessage).toHaveBeenCalledTimes(5)
    })

    it('should ignore other sources than parent window', () => {
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const onConnectionHandler = vi.fn<(status: ConnectionStatus) => void>()

        adapter = new IFrameClientAdapter<TestMethods, TestEvents>()

        expect(parentWindowMock.postMessage).toHaveBeenCalledWith(
            {
                id: defaultUuid,
                method: 'anyrpc::iframe-init',
                params: ['anyrpc-iframe-adapter'],
                jsonrpc: '2.0',
            },
            '*',
        )

        const initResponse: RpcResponse<any> = {
            jsonrpc: '2.0',
            id: defaultUuid,
            result: null,
        }

        globalThis.window.dispatchEvent(
            new MessageEvent('message', { data: initResponse, source: {} as unknown as Window, ports: [portMock] }),
        )

        expect(removeEventListenerSpy).not.toHaveBeenCalled()
        expect(onConnectionHandler).not.toHaveBeenCalled()
    })

    it('should ignore other messages than init response', () => {
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const onConnectionHandler = vi.fn<(status: ConnectionStatus) => void>()

        adapter = new IFrameClientAdapter<TestMethods, TestEvents>()

        expect(parentWindowMock.postMessage).toHaveBeenCalledWith(
            {
                id: defaultUuid,
                method: 'anyrpc::iframe-init',
                params: ['anyrpc-iframe-adapter'],
                jsonrpc: '2.0',
            },
            '*',
        )

        const initResponse: RpcResponse<any> = {
            jsonrpc: '2.0',
            id: 'unknown-id',
            result: null,
        }

        globalThis.window.dispatchEvent(
            new MessageEvent('message', { data: initResponse, source: parentWindowMock, ports: [portMock] }),
        )

        expect(removeEventListenerSpy).not.toHaveBeenCalled()
        expect(onConnectionHandler).not.toHaveBeenCalled()
    })

    it('should ignore invalid response messages', () => {
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const onConnectionHandler = vi.fn<(status: ConnectionStatus) => void>()

        adapter = new IFrameClientAdapter<TestMethods, TestEvents>()

        expect(parentWindowMock.postMessage).toHaveBeenCalledWith(
            {
                id: defaultUuid,
                method: 'anyrpc::iframe-init',
                params: ['anyrpc-iframe-adapter'],
                jsonrpc: '2.0',
            },
            '*',
        )

        globalThis.window.dispatchEvent(
            new MessageEvent('message', { data: null, source: parentWindowMock, ports: [portMock] }),
        )

        expect(removeEventListenerSpy).not.toHaveBeenCalled()
        expect(onConnectionHandler).not.toHaveBeenCalled()
    })

    it('should throw for invalid origin option', () => {
        expect(() => {
            new IFrameClientAdapter<TestMethods, TestEvents>(undefined, { origin: [] })
        }).toThrowError('Origin option cannot be an empty array')
    })

    it('should not connect if origin is not allowed', () => {
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const onConnectionHandler = vi.fn<(status: ConnectionStatus) => void>()
        const originHandlerFn = vi.fn<(origin: string) => boolean>(() => false)

        adapter = new IFrameClientAdapter<TestMethods, TestEvents>(undefined, {
            origin: originHandlerFn,
        })

        expect(parentWindowMock.postMessage).toHaveBeenCalledWith(
            {
                id: defaultUuid,
                method: 'anyrpc::iframe-init',
                params: ['anyrpc-iframe-adapter'],
                jsonrpc: '2.0',
            },
            '*',
        )

        const initResponse: RpcResponse<any> = {
            jsonrpc: '2.0',
            id: defaultUuid,
            result: null,
        }

        globalThis.window.dispatchEvent(
            new MessageEvent('message', { data: initResponse, source: parentWindowMock, ports: [portMock] }),
        )

        expect(removeEventListenerSpy).not.toHaveBeenCalled()
        expect(onConnectionHandler).not.toHaveBeenCalled()
        expect(originHandlerFn).toHaveBeenCalledWith(parentWindowMock.origin)
    })

    it('should work with origin option as string', () => {
        adapter = new IFrameClientAdapter<TestMethods, TestEvents>(undefined, {
            origin: 'https://example.com',
        })

        expect((adapter as any).isOriginValid('https://example.com')).toBe(true)
        expect((adapter as any).isOriginValid('http://example.com')).toBe(false)
        expect((adapter as any).isOriginValid('https://examples.com')).toBe(false)
        expect((adapter as any).isOriginValid('https://example.at')).toBe(false)
    })

    it.todo('should respect origin option as regex')

    it.todo('should respect origin option as array')

    it.todo('should respect origin option as function')

    it.todo('should respect origin option as true')

    it.todo('should respect polling interval option')
})
