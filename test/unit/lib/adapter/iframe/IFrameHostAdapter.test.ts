import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IFrameHostAdapter } from '@/lib/adapter/iframe/IFrameHostAdapter'
import { RpcRequest } from '@/types/RpcMessages'

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

    beforeEach(() => {
        mockIframe = document.createElement('iframe')
        mockContentWindow = {
            postMessage: vi.fn<(this: void, message: any, targetOrigin: string, transfer?: Transferable[]) => void>(),
        } as unknown as Window
        Object.defineProperty(mockIframe, 'contentWindow', { value: mockContentWindow, writable: false })
    })

    afterEach(() => {
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

        const adapter = new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe)

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

        const adapter = new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe, undefined, { reconnect: false })

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

        new IFrameHostAdapter<TestMethods, TestEvents>(mockIframe, undefined, {
            postMessageOrigin: 'https://example.com',
        })

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
})
