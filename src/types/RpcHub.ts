import type { Promisable } from 'type-fest'
import type { MethodFn, MethodMap } from './MethodMap'
import type { RpcListener, Unsubscribe } from './EventEmitter'
import type { UncallableMethodName } from './MethodName'
import type { ResolvesToVoid, RpcChannel, RpcHandleableName, RpcNotifiable, RpcResult } from './RpcChannel'

export interface RpcPeer<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    readonly id: string
    readonly channel: RpcChannel<Methods, Events>
}

export interface RpcCallContext<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    readonly peer: RpcPeer<Methods, Events>
}

export type RpcHubHandler<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>, Fn extends MethodFn> = (
    context: RpcCallContext<Methods, Events>,
    ...args: Parameters<Fn>
) => Promisable<Awaited<ReturnType<Fn>>>

export type RpcHubListener<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Fn extends MethodFn,
> = (context: RpcCallContext<Methods, Events>, ...args: Parameters<Fn>) => unknown

export interface RpcHubEvents<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    'rpc.peer.connected'(peer: RpcPeer<Methods, Events>): void
    'rpc.peer.disconnected'(peer: RpcPeer<Methods, Events>): void
}

export type RpcPeerPromise<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Result,
> = Promise<Result> & {
    readonly peer: RpcPeer<Methods, Events>
}

export type RpcBroadcastMethod<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Fn extends MethodFn,
> = ((...args: Parameters<Fn>) => RpcPeerPromise<Methods, Events, RpcResult<Fn>>[]) &
    (ResolvesToVoid<Fn> extends true ? RpcNotifiable<Fn> : unknown)

export interface RpcHubMeta<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    readonly peers: readonly RpcPeer<Methods, Events>[]
    peer(id: string): RpcPeer<Methods, Events> | undefined
    handle<Name extends RpcHandleableName<Events>>(
        name: Name,
        handler: RpcHubHandler<Methods, Events, Events[Name]>,
    ): Unsubscribe
    on<Name extends RpcHandleableName<Events>>(
        name: Name,
        listener: RpcHubListener<Methods, Events, Events[Name]>,
    ): Unsubscribe
    on<Name extends keyof RpcHubEvents<Methods, Events>>(
        name: Name,
        listener: RpcListener<RpcHubEvents<Methods, Events>[Name]>,
    ): Unsubscribe
    destroy(): void
}

export type RpcHub<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> = {
    [Method in Exclude<keyof Methods, UncallableMethodName>]: RpcBroadcastMethod<Methods, Events, Methods[Method]>
} & {
    readonly $: RpcHubMeta<Methods, Events>
}
