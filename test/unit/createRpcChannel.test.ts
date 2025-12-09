import { describe, expect, it, vi } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { AbstractRpcAdapter } from '@/lib/AbstractRpcAdapter'
import { RpcError } from '@/lib/RpcError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { RpcMessage } from '@/types/RpcMessages'
import { EventEmitter } from '@/lib/EventEmitter'

interface TestMethods {
    add(a: number, b: number): Promise<number>
    subtract(a: number, b: number): number
}

interface TestEvents {
    onEvent(message: string): boolean
}

class MockAdapter extends AbstractRpcAdapter<TestMethods, TestEvents> {
    sendMessage = vi.fn<(msg: RpcMessage<TestMethods, TestEvents>) => unknown>()

    triggerHandler(message: any) {
        const handler = (this as any)._messageHandler
        handler?.(message)
    }
}

describe(createRpcChannel, () => {
    it('should send an RPC request and resolve with the correct result', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

        adapter.sendMessage.mockImplementationOnce((message) => {
            const { id } = message

            expect(message).toMatchObject({
                jsonrpc: '2.0',
                method: 'add',
                params: [2, 3],
            })

            adapter.triggerHandler({
                jsonrpc: '2.0',
                type: 'response',
                id,
                result: 5,
            })
        })

        const result = await rpcChannel.add(2, 3)

        expect(result).toBe(5)

        adapter.sendMessage.mockRestore()
    })

    it('should handle an RPC error response correctly', async () => {
        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter)

        adapter.sendMessage.mockImplementationOnce(({ id }) => {
            adapter.triggerHandler({
                jsonrpc: '2.0',
                id,
                error: { code: RpcErrorCode.SERVER_ERROR, message: 'Server error' },
            })
        })

        await expect(() => rpcChannel.add(2, 3)).rejects.toThrowError(RpcError)
    })

    it('should timeout if no response is received', async () => {
        vi.useFakeTimers()

        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel<TestMethods, TestEvents>(adapter, { timeout: 100 })

        const messagePromise = rpcChannel.add(2, 3)
        vi.runAllTimers()

        await expect(messagePromise).rejects.toThrowError(RpcError)
    })

    it('should trigger an event when dispatched', () => {
        const eventEmitterSpy = vi.spyOn(EventEmitter.prototype, 'addEventListener')

        const adapter = new MockAdapter()
        const rpcChannel = createRpcChannel(adapter)

        const onEventMock = vi.fn<(message: string) => boolean>()
        rpcChannel.addEventListener('onEvent', onEventMock)

        const mockRequest = {
            jsonrpc: '2.0',
            id: 'event-id',
            method: 'onEvent',
            params: ['Hello, world!'],
        }

        adapter.triggerHandler(mockRequest)

        expect(eventEmitterSpy).toHaveBeenCalledWith('onEvent', onEventMock)
        expect(onEventMock).toHaveBeenCalledWith('Hello, world!')
    })
})
