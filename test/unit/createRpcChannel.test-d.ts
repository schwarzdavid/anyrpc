import { assertType, describe, expectTypeOf, it, vi } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import type { RpcMessage } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import type { MethodMap } from '@/types/MethodMap'
import type { Unsubscribe } from '@/types/EventEmitter'
import type { RpcError } from '@/lib/RpcError'

interface TestMethods {
    add(a: number, b: number): number
    subtract(a: number, b: number): Promise<number>
    log(message: string): void
    flush(): Promise<void>
    find(id?: string): string | undefined
}

interface TestEvents {
    divide(a: number, b: number): number
    multiply(a: number, b: number): Promise<number>
}

class TestAdapter<M extends MethodMap<M> = TestMethods, E extends MethodMap<E> = TestEvents> extends AbstractRpcAdapter<
    M,
    E
> {
    sendMessage = vi.fn<(message: RpcMessage<M, E>) => unknown>()
    connect() {
        this.connectionStatus = ConnectionStatus.CONNECTED
    }
}

describe(createRpcChannel, () => {
    const rpcChannel = createRpcChannel(new TestAdapter())

    describe('remote methods', () => {
        it('should allow methods defined in method generic', () => {
            assertType<Promise<number>>(rpcChannel.add(2, 3))
        })

        it('should disallow methods with wrong arguments', () => {
            // @ts-expect-error
            assertType<Promise<number>>(rpcChannel.add('2', '3'))
        })

        it('should disallow methods with wrong return type', () => {
            // @ts-expect-error
            assertType<Promise<string>>(rpcChannel.add(2, 3))
        })

        it('should always resolve to promise return types', () => {
            assertType<Promise<number>>(rpcChannel.subtract(2, 3))
        })

        it('should disallow methods not defined in method generic', () => {
            // @ts-expect-error
            assertType(rpcChannel.doSomething())
        })

        it('should reject method maps that use uncallable method names', () => {
            interface WithThen {
                then(): void
                regular(): void
            }
            interface WithReserved {
                'rpc.discover'(): void
            }
            interface WithToString {
                toString(): string
            }
            interface WithToJSON {
                toJSON(): string
            }
            interface WithDollar {
                $(): void
            }

            // @ts-expect-error
            assertType(createRpcChannel(new TestAdapter<WithThen>()))
            // @ts-expect-error
            assertType(createRpcChannel(new TestAdapter<WithReserved>()))
            // @ts-expect-error
            assertType(createRpcChannel(new TestAdapter<WithToString>()))
            // @ts-expect-error
            assertType(createRpcChannel(new TestAdapter<WithToJSON>()))
            // @ts-expect-error
            assertType(createRpcChannel(new TestAdapter<WithDollar>()))
            // @ts-expect-error
            assertType(createRpcChannel(new TestAdapter<TestMethods, WithToString>()))
        })

        it('should accept method maps with index signatures', () => {
            const channel = createRpcChannel(new TestAdapter<Record<string, () => void>>())

            expectTypeOf(channel.anything).returns.toEqualTypeOf<Promise<void>>()
        })

        it('should resolve results that may be undefined as null', () => {
            expectTypeOf(rpcChannel.find).returns.toEqualTypeOf<Promise<string | null>>()
        })

        it('should keep void and defined results unchanged', () => {
            expectTypeOf(rpcChannel.log).returns.toEqualTypeOf<Promise<void>>()
            expectTypeOf(rpcChannel.flush).returns.toEqualTypeOf<Promise<void>>()
            expectTypeOf(rpcChannel.add).returns.toEqualTypeOf<Promise<number>>()
        })
    })

    describe('notify', () => {
        it('should offer notify on methods returning void', () => {
            expectTypeOf(rpcChannel.log.notify).toEqualTypeOf<(message: string) => void>()
        })

        it('should offer notify on methods returning Promise<void>', () => {
            expectTypeOf(rpcChannel.flush.notify).toEqualTypeOf<() => void>()
        })

        it('should not offer notify on methods with a return value', () => {
            expectTypeOf(rpcChannel.add).not.toHaveProperty('notify')
            expectTypeOf(rpcChannel.subtract).not.toHaveProperty('notify')
            expectTypeOf(rpcChannel.find).not.toHaveProperty('notify')
        })

        it('should check notify arguments', () => {
            // @ts-expect-error
            expectTypeOf(rpcChannel.log.notify).toBeCallableWith(1)
        })
    })

    describe('$.handle', () => {
        it('should accept handlers with matching signature and return an unsubscribe function', () => {
            expectTypeOf(
                rpcChannel.$.handle('divide', vi.fn<(a: number, b: number) => number>()),
            ).toEqualTypeOf<Unsubscribe>()
        })

        it('should accept async handlers', () => {
            expectTypeOf(rpcChannel.$.handle).toBeCallableWith(
                'divide',
                vi.fn<(a: number, b: number) => Promise<number>>(),
            )
        })

        it('should reject handlers with wrong arguments', () => {
            // @ts-expect-error
            expectTypeOf(rpcChannel.$.handle).toBeCallableWith('divide', vi.fn<(a: number, b: boolean) => number>())
        })

        it('should reject handlers with wrong return type', () => {
            // @ts-expect-error
            expectTypeOf(rpcChannel.$.handle).toBeCallableWith('divide', vi.fn<(a: number, b: number) => string>())
        })

        it('should reject handlers for unknown or reserved methods', () => {
            // @ts-expect-error
            expectTypeOf(rpcChannel.$.handle).toBeCallableWith('unknown', vi.fn<() => void>())
            // @ts-expect-error
            expectTypeOf(rpcChannel.$.handle).toBeCallableWith('rpc.custom', vi.fn<() => void>())
            // @ts-expect-error
            expectTypeOf(rpcChannel.$.handle).toBeCallableWith('rpc.connected', vi.fn<() => void>())
        })
    })

    describe('$.on', () => {
        it('should accept listeners with matching arguments and return an unsubscribe function', () => {
            expectTypeOf(
                rpcChannel.$.on('divide', vi.fn<(a: number, b: number) => void>()),
            ).toEqualTypeOf<Unsubscribe>()
        })

        it('should ignore the return type of listeners', () => {
            assertType<Unsubscribe>(rpcChannel.$.on('divide', vi.fn<(a: number, b: number) => string>()))
        })

        it('should reject listeners with wrong arguments', () => {
            // @ts-expect-error
            expectTypeOf(rpcChannel.$.on).toBeCallableWith('divide', vi.fn<(a: string) => void>())
        })

        it('should accept connection event listeners', () => {
            assertType<Unsubscribe>(rpcChannel.$.on('rpc.connected', vi.fn<() => void>()))
            assertType<Unsubscribe>(rpcChannel.$.on('rpc.disconnected', vi.fn<() => void>()))
            assertType<Unsubscribe>(rpcChannel.$.on('rpc.status', vi.fn<(status: ConnectionStatus) => void>()))
            assertType<Unsubscribe>(rpcChannel.$.on('rpc.error', vi.fn<(error: RpcError) => void>()))
            // @ts-expect-error
            assertType<Unsubscribe>(rpcChannel.$.on('rpc.error', vi.fn<(error: string) => void>()))
        })

        it('should reject reserved names that are not connection events', () => {
            // @ts-expect-error
            expectTypeOf(rpcChannel.$.on).toBeCallableWith('rpc.custom', vi.fn<() => void>())
        })
    })
})
