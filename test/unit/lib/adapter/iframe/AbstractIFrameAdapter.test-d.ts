import { assertType, describe, it } from 'vitest'
import { AbstractIFrameAdapter, type IFrameAdapterOptions } from '@/lib/adapter/iframe/AbstractIFrameAdapter'

interface TestMethods {
    foo(baz: string): void
}

interface TestEvents {
    bar(test: boolean): number
}

class MockRpcAdapter extends AbstractIFrameAdapter<TestMethods, TestEvents> {
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(options?: Partial<IFrameAdapterOptions>) {
        super(options)
    }

    connect() {
        /* empty */
    }
}

describe(AbstractIFrameAdapter, () => {
    it('should allow send defined request messages', () => {
        const adapter = new MockRpcAdapter()

        assertType(
            adapter.sendMessage({
                id: 'any-id',
                jsonrpc: '2.0',
                method: 'foo',
                params: ['hi'],
            }),
        )
    })

    it('should allow send defined response messages', () => {
        const adapter = new MockRpcAdapter()

        assertType(
            adapter.sendMessage({
                id: 'any-id',
                jsonrpc: '2.0',
                result: 5,
            }),
        )
    })

    it('should allow send internal requests', () => {
        const adapter = new MockRpcAdapter()

        assertType(
            adapter.sendMessage({
                id: 'any-id',
                jsonrpc: '2.0',
                method: 'anyrpc::iframe-init',
                params: ['name'],
            }),
        )
    })

    it('should deny sending undefined requests', () => {
        const adapter = new MockRpcAdapter()

        assertType(
            // @ts-expect-error
            adapter.sendMessage({ id: 'any-id', jsonrpc: '2.0', method: 'unknown-method', params: ['foo', 'bar'] }),
        )
    })

    it('should deny sending undefined responses', () => {
        const adapter = new MockRpcAdapter()

        // @ts-expect-error
        assertType(adapter.sendMessage({ id: 'any-id', jsonrpc: '2.0', result: 'not existing' }))
    })
})
