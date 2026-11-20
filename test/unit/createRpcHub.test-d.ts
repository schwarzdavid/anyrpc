import { assertType, describe, expectTypeOf, it, vi } from 'vitest'
import { createRpcHub } from '@/createRpcHub'
import { AbstractRpcHubAdapter, type RpcPeerContextArgument } from '@/lib/adapter/AbstractRpcHubAdapter'
import type { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import type { MethodMap } from '@/types/MethodMap'
import type { Unsubscribe } from '@/types/EventEmitter'
import type { RpcChannel } from '@/types/RpcChannel'
import type { RpcCallContext, RpcHub, RpcPeer, RpcPeerPromise } from '@/types/RpcHub'

interface HubToPeer {
    getName(): string
    find(id: string): string | undefined
    refresh(): void
    flush(): Promise<void>
}

interface PeerToHub {
    getState(key: string): number
    report(value: number): void
}

class TestHubAdapter<
    M extends MethodMap<M> = HubToPeer,
    E extends MethodMap<E> = PeerToHub,
> extends AbstractRpcHubAdapter<M, E> {
    connect = vi.fn<() => void>()
    destroy = vi.fn<() => void>()
}

interface Session {
    user: string
}

class ContextHubAdapter<
    M extends MethodMap<M> = HubToPeer,
    E extends MethodMap<E> = PeerToHub,
> extends AbstractRpcHubAdapter<M, E, Session> {
    connect = vi.fn<() => void>()
    destroy = vi.fn<() => void>()

    join(adapter: AbstractRpcAdapter<M, E>, context: Session): string {
        return this.addPeer(adapter, context)
    }
}

class OptionalContextHubAdapter extends AbstractRpcHubAdapter<HubToPeer, PeerToHub, Session | undefined> {
    connect = vi.fn<() => void>()
    destroy = vi.fn<() => void>()
}

describe(createRpcHub, () => {
    const hub = createRpcHub(new TestHubAdapter())

    describe('peers', () => {
        it('should expose peers with a typed channel', () => {
            expectTypeOf(hub.$.peers).toEqualTypeOf<readonly RpcPeer<HubToPeer, PeerToHub>[]>()
            expectTypeOf(hub.$.peer('id')).toEqualTypeOf<RpcPeer<HubToPeer, PeerToHub> | undefined>()
            expectTypeOf<RpcPeer<HubToPeer, PeerToHub>['channel']>().toEqualTypeOf<RpcChannel<HubToPeer, PeerToHub>>()
        })

        it('should pass the peer to hub events', () => {
            hub.$.on('rpc.peer.connected', (peer) => {
                expectTypeOf(peer).toEqualTypeOf<RpcPeer<HubToPeer, PeerToHub>>()
            })
            hub.$.on('rpc.peer.disconnected', (peer) => {
                expectTypeOf(peer).toEqualTypeOf<RpcPeer<HubToPeer, PeerToHub>>()
            })
        })
    })

    describe('handle', () => {
        it('should pass the call context before the params', () => {
            hub.$.handle('getState', (context, key) => {
                expectTypeOf(context).toEqualTypeOf<RpcCallContext<HubToPeer, PeerToHub>>()
                expectTypeOf(key).toEqualTypeOf<string>()

                return 1
            })
        })

        it('should accept async handlers', () => {
            expectTypeOf(hub.$.handle('getState', () => Promise.resolve(1))).toEqualTypeOf<Unsubscribe>()
        })

        it('should reject handlers with a wrong return type', () => {
            // @ts-expect-error
            assertType(hub.$.handle('getState', () => 'wrong'))
        })

        it('should reject methods the hub cannot handle', () => {
            // @ts-expect-error
            assertType(hub.$.handle('getName', () => 'name'))
            // @ts-expect-error
            assertType(hub.$.handle('rpc.peer.connected', () => undefined))
        })
    })

    describe('on', () => {
        it('should pass the call context before the params', () => {
            hub.$.on('report', (context, value) => {
                expectTypeOf(context).toEqualTypeOf<RpcCallContext<HubToPeer, PeerToHub>>()
                expectTypeOf(value).toEqualTypeOf<number>()
            })
        })

        it('should reject unknown events', () => {
            // @ts-expect-error
            assertType(hub.$.on('unknown', () => undefined))
            // @ts-expect-error
            assertType(hub.$.on('rpc.connected', () => undefined))
        })
    })

    describe('broadcast', () => {
        it('should return one typed promise per peer', () => {
            expectTypeOf(hub.getName()).toEqualTypeOf<RpcPeerPromise<HubToPeer, PeerToHub, string>[]>()
            expectTypeOf(hub.find('id')).toEqualTypeOf<RpcPeerPromise<HubToPeer, PeerToHub, string | null>[]>()
            expectTypeOf(hub.getName()[0]!.peer).toEqualTypeOf<RpcPeer<HubToPeer, PeerToHub>>()

            assertType<Promise<string[]>>(Promise.all(hub.getName()))
            assertType<Promise<string>>(Promise.any(hub.getName()))
        })

        it('should return one typed promise per peer for a broadcast with options', () => {
            expectTypeOf(hub.getName.with({ timeout: 1000 })()).toEqualTypeOf<
                RpcPeerPromise<HubToPeer, PeerToHub, string>[]
            >()

            // @ts-expect-error
            assertType(hub.find.with({})(1))
        })

        it('should check the params', () => {
            // @ts-expect-error
            assertType(hub.find(1))
        })

        it('should only allow notifications for methods without a result', () => {
            expectTypeOf(hub.refresh.notify).toEqualTypeOf<() => void>()
            expectTypeOf(hub.flush.notify).toEqualTypeOf<() => void>()

            // @ts-expect-error
            assertType(hub.getName.notify)
        })

        it('should not expose methods the peers do not offer', () => {
            // @ts-expect-error
            assertType(hub.getState)
        })
    })

    describe('method names', () => {
        it('should refuse hub adapters whose methods cannot be called', () => {
            // @ts-expect-error
            assertType(createRpcHub(new TestHubAdapter<{ then(): void }>()))
        })
    })

    describe('peer context', () => {
        const contextHub = createRpcHub(new ContextHubAdapter())

        it('should infer the context from the hub adapter', () => {
            expectTypeOf(contextHub).toEqualTypeOf<RpcHub<HubToPeer, PeerToHub, Session>>()
            expectTypeOf(contextHub.$.peers).toEqualTypeOf<readonly RpcPeer<HubToPeer, PeerToHub, Session>[]>()
            expectTypeOf(contextHub.$.peer('id')).toEqualTypeOf<RpcPeer<HubToPeer, PeerToHub, Session> | undefined>()
        })

        it('should type the context in handlers, listeners, events and broadcasts', () => {
            contextHub.$.handle('getState', ({ peer }) => {
                expectTypeOf(peer.context).toEqualTypeOf<Session>()

                return 1
            })
            contextHub.$.on('report', ({ peer }) => {
                expectTypeOf(peer.context).toEqualTypeOf<Session>()
            })
            contextHub.$.on('rpc.peer.connected', (peer) => {
                expectTypeOf(peer.context).toEqualTypeOf<Session>()
            })
            contextHub.$.on('rpc.peer.disconnected', (peer) => {
                expectTypeOf(peer.context).toEqualTypeOf<Session>()
            })

            expectTypeOf(contextHub.getName()).toEqualTypeOf<RpcPeerPromise<HubToPeer, PeerToHub, string, Session>[]>()
        })

        it('should accept the context as third explicit type argument', () => {
            expectTypeOf(createRpcHub<HubToPeer, PeerToHub, Session>(new ContextHubAdapter())).toEqualTypeOf<
                RpcHub<HubToPeer, PeerToHub, Session>
            >()
        })

        it('should leave the context unknown when an adapter with a context gets only two type arguments', () => {
            const untypedHub = createRpcHub<HubToPeer, PeerToHub>(new ContextHubAdapter())

            expectTypeOf(untypedHub).toEqualTypeOf<RpcHub<HubToPeer, PeerToHub, unknown>>()

            untypedHub.$.handle('getState', ({ peer }) => {
                expectTypeOf(peer.context).toBeUnknown()

                return 1
            })
        })

        it('should leave the context unknown when an optional context gets only two type arguments', () => {
            expectTypeOf(createRpcHub<HubToPeer, PeerToHub>(new OptionalContextHubAdapter())).toEqualTypeOf<
                RpcHub<HubToPeer, PeerToHub, unknown>
            >()
            expectTypeOf(createRpcHub(new OptionalContextHubAdapter())).toEqualTypeOf<
                RpcHub<HubToPeer, PeerToHub, Session | undefined>
            >()
        })

        it('should keep the context undefined for adapters without one', () => {
            expectTypeOf(hub).toEqualTypeOf<RpcHub<HubToPeer, PeerToHub>>()
            expectTypeOf(createRpcHub<HubToPeer, PeerToHub>(new TestHubAdapter())).toEqualTypeOf<
                RpcHub<HubToPeer, PeerToHub>
            >()
            expectTypeOf<RpcPeer<HubToPeer, PeerToHub>['context']>().toEqualTypeOf<undefined>()
        })

        it('should still reject forbidden method names in every call form', () => {
            interface Thenable {
                then(): void
            }

            // @ts-expect-error
            assertType(createRpcHub(new TestHubAdapter<Thenable>()))
            // @ts-expect-error
            assertType(createRpcHub<Thenable, PeerToHub>(new TestHubAdapter()))
            // @ts-expect-error
            assertType(createRpcHub<Thenable, PeerToHub, Session>(new ContextHubAdapter()))
        })

        it('should require the context argument only when the context cannot be undefined', () => {
            expectTypeOf<RpcPeerContextArgument<Session>>().toEqualTypeOf<[context: Session]>()
            expectTypeOf<RpcPeerContextArgument<undefined>>().toEqualTypeOf<[context?: undefined]>()
            expectTypeOf<RpcPeerContextArgument<string | undefined>>().toEqualTypeOf<[context?: string | undefined]>()
        })
    })
})
