import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AbstractIFrameAdapter, IFrameAdapterOptions } from '@/lib/adapter/iframe/AbstractIFrameAdapter'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { RpcRequest } from '@/types/RpcMessages'
import { MessageHandler } from '@/lib/AbstractRpcAdapter'

interface TestMethods {
    foo(): void
}

interface TestEvents {
    bar(): void
}

class MockRpcAdapter extends AbstractIFrameAdapter<TestMethods, TestEvents> {
    readonly messageHandlerMock = vi.fn<MessageHandler>()

    constructor(options?: Partial<IFrameAdapterOptions>) {
        super(options)
        this.messageHandler = this.messageHandlerMock
    }

    setPort(port: MessagePort) {
        this.port = port
    }
}

describe(AbstractIFrameAdapter, () => {
    let messagePortMock: MessagePort
    let adapter: MockRpcAdapter | null = null

    beforeEach(() => {
        messagePortMock = {
            addEventListener: vi.fn<any>(),
            start: vi.fn<any>(),
            close: vi.fn<any>(),
            postMessage: vi.fn<any>(),
        } as unknown as MessagePort
    })

    afterEach(() => {
        adapter?.destroy()
        adapter = null

        vi.clearAllMocks()
    })

    it('should attach event listeners and start channel when setting port', () => {
        adapter = new MockRpcAdapter()
        adapter.setPort(messagePortMock)

        expect(messagePortMock.addEventListener).toHaveBeenCalledWith('message', expect.any(Function))
        expect(messagePortMock.start).toHaveBeenCalledWith()
        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
    })

    it('should send message to port when calling sendMessage', () => {
        adapter = new MockRpcAdapter()
        adapter.setPort(messagePortMock)

        const message: RpcRequest<TestMethods> = {
            jsonrpc: '2.0',
            method: 'foo',
            params: [],
            id: 'test-id',
        }

        adapter.sendMessage(message)

        expect(messagePortMock.postMessage).toHaveBeenCalledWith(message)
    })

    it('should remove event listeners when destroying', () => {
        adapter = new MockRpcAdapter()
        adapter.setPort(messagePortMock)

        adapter.destroy()

        expect(messagePortMock.close).toHaveBeenCalledWith()
        expect(adapter.connectionStatus).toBe(ConnectionStatus.CLOSED)
    })

    it('should pass message to message handler', () => {
        adapter = new MockRpcAdapter()

        vi.spyOn(messagePortMock, 'addEventListener').mockImplementationOnce((_, handlerOrObject) => {
            const data = {
                foo: 'bar',
            }

            let handler: EventListener

            if (typeof handlerOrObject === 'function') {
                handler = handlerOrObject
            } else {
                handler = handlerOrObject.handleEvent
            }

            expect(handler).toStrictEqual(expect.any(Function))

            handler({ data } as MessageEvent)

            expect(adapter!.messageHandlerMock).toHaveBeenCalledWith(data)
        })

        adapter.setPort(messagePortMock)
    })
})
