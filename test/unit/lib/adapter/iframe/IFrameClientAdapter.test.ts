import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IFrameClientAdapter } from '@/lib/adapter/iframe'
import { RpcResponse } from '@/types/RpcMessages'
import { uuid } from '@/utils/uuid'

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
    const parentWindowMock = {
        postMessage: vi.fn<(this: void, message: any, targetOrigin: string, transfer?: Transferable[]) => void>(),
    } as unknown as Window

    beforeEach(() => {
        vi.stubGlobal('parent', parentWindowMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    it('should establish a connection with parent window', () => {
        const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

        const adapter = new IFrameClientAdapter<TestMethods, TestEvents>()

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

        const portMock: MessagePort = {
            addEventListener: vi.fn<any>(),
            start: vi.fn<any>(),
        } as unknown as MessagePort

        globalThis.window.dispatchEvent(
            new MessageEvent('message', { data: initResponse, source: parentWindowMock, ports: [portMock] }),
        )

        expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
        expect((adapter as any)._port).toBe(portMock)
        expect(portMock.start).toHaveBeenCalledWith()
    })

    it('should polling init messages if parent does not respond', () => {
        vi.useFakeTimers()

        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
        const uuidMock = vi.mocked(uuid)
        for (let i = 1; i <= 10; i++) {
            uuidMock.mockReturnValueOnce(i.toString())
        }

        new IFrameClientAdapter<TestMethods, TestEvents>()

        vi.advanceTimersByTime(4500)

        expect(parentWindowMock.postMessage).toHaveBeenCalledTimes(5)

        const initResponse: RpcResponse<any> = {
            jsonrpc: '2.0',
            id: '2',
            result: null,
        }

        const portMock: MessagePort = {
            addEventListener: vi.fn<any>(),
            start: vi.fn<any>(),
        } as unknown as MessagePort

        globalThis.window.dispatchEvent(
            new MessageEvent('message', { data: initResponse, source: parentWindowMock, ports: [portMock] }),
        )

        vi.advanceTimersByTime(5000)

        expect(parentWindowMock.postMessage).toHaveBeenCalledTimes(5)
        expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
    })

    it.todo('should ignore response message if MessagePort is missing')

    it.todo('should respect origin option as domain')

    it.todo('should respect origin option as regex')

    it.todo('should respect origin option as array')

    it.todo('should respect origin option as function')

    it.todo('should respect origin option as true')

    it.todo('should respect polling interval option')

    it.todo('should ignore other sources than parent window')

    it.todo('should ignore other messages than init response')

    it.todo('should ignore init response with unused id')
})
