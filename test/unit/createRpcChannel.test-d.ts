import { assertType, describe, it, vi } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { AbstractRpcAdapter } from '@/lib/AbstractRpcAdapter'
import { RpcMessage } from '@/types/RpcMessages'

interface TestMethods {
    add(a: number, b: number): number
    subtract(a: number, b: number): Promise<number>
}

interface TestEvents {
    divide(a: number, b: number): number
    multiply(a: number, b: number): Promise<number>
}

class TestAdapter extends AbstractRpcAdapter<TestMethods, TestEvents> {
    override sendMessage = vi.fn<(message: RpcMessage<TestMethods, TestEvents>) => unknown>()
}

describe(createRpcChannel, () => {
    it('should allow methods defined in method generic', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        assertType<Promise<number>>(rpcChannel.add(2, 3))
    })

    it('should disallow methods with wrong arguments', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        // @ts-expect-error
        assertType<Promise<number>>(rpcChannel.add('2', '3'))
    })

    it('should disallow methods with wrong return type', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        // @ts-expect-error
        assertType<Promise<string>>(rpcChannel.add(2, 3))
    })

    it('should always resolve to promise return types', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        assertType<Promise<number>>(rpcChannel.subtract(2, 3))
    })

    it('should disallow methods not defined in method generic', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        // @ts-expect-error
        assertType(rpcChannel.doSomething())
    })

    it('should allow adding event listeners', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        assertType<void>(rpcChannel.addEventListener('divide', vi.fn<(a: number, b: number) => number>()))
    })

    it('should disallow adding event listeners with wrong arguments', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        // @ts-expect-error
        assertType<void>(rpcChannel.addEventListener('divide', vi.fn<(a: number, b: boolean) => number>()))
    })

    it('should disallow adding event listeners with wrong return type', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        // @ts-expect-error
        assertType<void>(rpcChannel.addEventListener('divide', vi.fn<(a: number, b: number) => boolean>()))
    })

    it('should ignore return type of passive event listeners', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        assertType<void>(
            rpcChannel.addEventListener('divide', vi.fn<(a: number, b: number) => boolean>(), { passive: true }),
        )
    })

    it('should ignore promise return type of active event listeners', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        assertType<void>(rpcChannel.addEventListener('multiply', vi.fn<(a: number, b: number) => number>()))
        assertType<void>(rpcChannel.addEventListener('multiply', vi.fn<(a: number, b: number) => Promise<number>>()))
        assertType<void>(rpcChannel.addEventListener('divide', vi.fn<(a: number, b: number) => number>()))
        assertType<void>(rpcChannel.addEventListener('divide', vi.fn<(a: number, b: number) => Promise<number>>()))
    })

    it('should always allow removing event listeners', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        assertType<void>(rpcChannel.removeEventListener('divide', vi.fn<(a: number, b: number) => number>()))
    })

    it('should ignore return type of removed event listeners', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        assertType<void>(rpcChannel.removeEventListener('multiply', vi.fn<(a: number, b: number) => boolean>()))
        assertType<void>(rpcChannel.removeEventListener('multiply', vi.fn<(a: number, b: number) => Promise<string>>()))
    })

    it('should disallow removing event listeners with wrong arguments', () => {
        const adapter = new TestAdapter()
        const rpcChannel = createRpcChannel(adapter)

        // @ts-expect-error
        assertType<void>(rpcChannel.removeEventListener('multiply', vi.fn<(a: number, b: boolean) => number>()))
    })
})
