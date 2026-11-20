import type { Promisable } from './Promisable'
import type { MethodFn, MethodMap } from './MethodMap'
import type { RpcListener, Unsubscribe } from './EventEmitter'
import type { UncallableMethodName } from './MethodName'
import type {
    ResolvesToVoid,
    RpcChannel,
    RpcConfigurable,
    RpcHandleableName,
    RpcNotifiable,
    RpcResult,
} from './RpcChannel'

export interface RpcPeer<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>, Context = undefined> {
    readonly id: string
    readonly channel: RpcChannel<Methods, Events>
    readonly context: Context
}

export interface RpcCallContext<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Context = undefined,
> {
    readonly peer: RpcPeer<Methods, Events, Context>
}

export type RpcHubHandler<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Fn extends MethodFn,
    Context = undefined,
> = (context: RpcCallContext<Methods, Events, Context>, ...args: Parameters<Fn>) => Promisable<Awaited<ReturnType<Fn>>>

export type RpcHubListener<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Fn extends MethodFn,
    Context = undefined,
> = (context: RpcCallContext<Methods, Events, Context>, ...args: Parameters<Fn>) => unknown

export interface RpcHubEvents<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Context = undefined,
> {
    'rpc.peer.connected'(peer: RpcPeer<Methods, Events, Context>): void
    'rpc.peer.disconnected'(peer: RpcPeer<Methods, Events, Context>): void
}

export type RpcPeerPromise<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Result,
    Context = undefined,
> = Promise<Result> & {
    readonly peer: RpcPeer<Methods, Events, Context>
}

export type RpcBroadcast<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Fn extends MethodFn,
    Context = undefined,
> = (...args: Parameters<Fn>) => RpcPeerPromise<Methods, Events, RpcResult<Fn>, Context>[]

export type RpcBroadcastMethod<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Fn extends MethodFn,
    Context = undefined,
> = RpcBroadcast<Methods, Events, Fn, Context> &
    RpcConfigurable<RpcBroadcast<Methods, Events, Fn, Context>> &
    (ResolvesToVoid<Fn> extends true ? RpcNotifiable<Fn> : unknown)

export interface RpcHubMeta<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>, Context = undefined> {
    readonly peers: readonly RpcPeer<Methods, Events, Context>[]
    peer(id: string): RpcPeer<Methods, Events, Context> | undefined
    handle<Name extends RpcHandleableName<Events>>(
        name: Name,
        handler: RpcHubHandler<Methods, Events, Events[Name], Context>,
    ): Unsubscribe
    on<Name extends RpcHandleableName<Events>>(
        name: Name,
        listener: RpcHubListener<Methods, Events, Events[Name], Context>,
    ): Unsubscribe
    on<Name extends keyof RpcHubEvents<Methods, Events, Context>>(
        name: Name,
        listener: RpcListener<RpcHubEvents<Methods, Events, Context>[Name]>,
    ): Unsubscribe
    destroy(): void
}

export type RpcHub<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>, Context = undefined> = {
    [Method in Exclude<keyof Methods, UncallableMethodName>]: RpcBroadcastMethod<
        Methods,
        Events,
        Methods[Method],
        Context
    >
} & {
    readonly $: RpcHubMeta<Methods, Events, Context>
}
