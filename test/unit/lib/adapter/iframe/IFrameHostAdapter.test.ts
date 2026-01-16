import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IFrameHostAdapter } from '@/lib/adapter/iframe/IFrameHostAdapter'
import type { RpcRequest, RpcResponse } from '@/types/RpcMessages'

interface TestMethods {
    exampleMethod: (foo: string, bar: number) => Promise<string>
}

interface TestEvents {
    testEvent: (arg: string) => Promise<string>
}

const InitMethodName = 'anyrpc::iframe-init'

describe(IFrameHostAdapter, () => {
    let mockIframe: HTMLIFrameElement
    let mockContentWindow: Window
    let adapter: IFrameHostAdapter<any, any> | undefined

    beforeEach(() => {
        adapter = undefined
        mockIframe = document.createElement('iframe')
        mockContentWindow = {
            postMessage: vi.fn<(this: void, message: any, targetOrigin: string, transfer?: Transferable[]) => void>(),
        } as unknown as Window
        Object.defineProperty(mockIframe, 'contentWindow', { value: mockContentWindow, writable: false })
    })

    afterEach(() => {
        adapter?.destroy()
        vi.restoreAllMocks()
    })

    it('should establish a connection', () => {
        const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const initRequestMessage: RpcRequest<{ [InitMethodName](name: string): void }> = {
            jsonrpc: '2.0',
            id: 'init-id',
            method: InitMethodName,
            params: ['anyrpc-iframe-adapter'],
        }

        adapter = new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe)
        adapter.connect()

        expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.anything())

        global.window.dispatchEvent(
            new MessageEvent('message', { data: initRequestMessage, source: mockContentWindow }),
        )

        expect(removeEventListenerSpy).not.toHaveBeenCalled()
        expect(mockContentWindow.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                jsonrpc: '2.0',
                id: 'init-id',
                result: null,
            }),
            '*',
            expect.arrayContaining([expect.any(MessagePort)]),
        )
        expect((adapter as any)._port).toSatisfy((value) => value instanceof MessagePort)
    })

    it('should not reconnect if reconnect option is set to false', () => {
        const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const initRequestMessage: RpcRequest<{ [InitMethodName](name: string): void }> = {
            jsonrpc: '2.0',
            id: 'init-id',
            method: InitMethodName,
            params: ['anyrpc-iframe-adapter'],
        }

        adapter = new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe, undefined, { reconnect: false })
        adapter.connect()

        expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.anything())

        global.window.dispatchEvent(
            new MessageEvent('message', { data: initRequestMessage, source: mockContentWindow }),
        )

        expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.anything())
        expect(mockContentWindow.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                jsonrpc: '2.0',
                id: 'init-id',
                result: null,
            }),
            '*',
            expect.arrayContaining([expect.any(MessagePort)]),
        )
        expect((adapter as any)._port).toSatisfy((value) => value instanceof MessagePort)
    })

    it('should respect postMessageOrigin option', () => {
        const initRequestMessage: RpcRequest<{ [InitMethodName](name: string): void }> = {
            jsonrpc: '2.0',
            id: 'init-id',
            method: InitMethodName,
            params: ['anyrpc-iframe-adapter'],
        }

        adapter = new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe, undefined, {
            postMessageOrigin: 'https://example.com',
        })
        adapter.connect()

        global.window.dispatchEvent(
            new MessageEvent('message', { data: initRequestMessage, source: mockContentWindow }),
        )

        expect(mockContentWindow.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                jsonrpc: '2.0',
                id: 'init-id',
                result: null,
            }),
            'https://example.com',
            expect.arrayContaining([expect.any(MessagePort)]),
        )
    })

    it('should ignore invalid messages from iframe on connection', () => {
        adapter = new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe)
        adapter.connect()

        global.window.dispatchEvent(new MessageEvent('message', { data: 'im a gummy bear', source: mockContentWindow }))

        expect(mockContentWindow.postMessage).not.toHaveBeenCalled()
    })

    it('should ignore response messages from iframe on connection', () => {
        const randomResponseMessage: RpcResponse<{ [InitMethodName](name: string): void }> = {
            jsonrpc: '2.0',
            id: 'init-id',
            result: undefined,
        }

        adapter = new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe)
        adapter.connect()

        global.window.dispatchEvent(
            new MessageEvent('message', { data: randomResponseMessage, source: mockContentWindow }),
        )

        expect(mockContentWindow.postMessage).not.toHaveBeenCalled()
    })

    it('should ignore messages from iframe other than init requests on connection', () => {
        const randomRequestMessage: RpcRequest<{ foo(name: string): void }> = {
            jsonrpc: '2.0',
            id: 'init-id',
            method: 'foo',
            params: ['bar'],
        }

        adapter = new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe)
        adapter.connect()

        global.window.dispatchEvent(
            new MessageEvent('message', { data: randomRequestMessage, source: mockContentWindow }),
        )

        expect(mockContentWindow.postMessage).not.toHaveBeenCalled()
    })

    it('should ignore messages from iframe if names do not match', () => {
        const initRequestMessage: RpcRequest<{ [InitMethodName](name: string): void }> = {
            jsonrpc: '2.0',
            id: 'init-id',
            method: InitMethodName,
            params: ['anyrpc-iframe-adapter-wrong'],
        }

        adapter = new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe, 'custom-name')
        adapter.connect()

        global.window.dispatchEvent(
            new MessageEvent('message', { data: initRequestMessage, source: mockContentWindow }),
        )

        expect(mockContentWindow.postMessage).not.toHaveBeenCalled()
    })

    it('should ignore messages from other sources than iframe', () => {
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const initRequestMessage: RpcRequest<{ [InitMethodName](name: string): void }> = {
            jsonrpc: '2.0',
            id: 'init-id',
            method: InitMethodName,
            params: ['anyrpc-iframe-adapter'],
        }

        adapter = new IFrameHostAdapter(mockIframe)
        adapter.connect()

        global.window.dispatchEvent(
            new MessageEvent('message', { data: initRequestMessage, source: {} as unknown as Window }),
        )

        expect(removeEventListenerSpy).not.toHaveBeenCalled()
    })
})
