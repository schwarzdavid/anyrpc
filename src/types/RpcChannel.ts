import type { RpcHandler, RpcListener, Unsubscribe } from './EventEmitter'
import type { MethodFn, MethodMap } from './MethodMap'
import type { ConnectionStatus } from './ConnectionStatus'
import type { RpcChannelEvents } from './RpcChannelEvents'
import type { ReservedMethodName, UncallableMethodName } from './MethodName'

export interface RpcNotifiable<Fn extends MethodFn> {
    notify(...args: Parameters<Fn>): void
}

type ResolvedReturnType<Fn extends MethodFn> = Awaited<ReturnType<Fn>>

type IsAny<T> = 0 extends 1 & T ? true : false

type ResolvesToUndefined<Fn extends MethodFn> =
    IsAny<ResolvedReturnType<Fn>> extends true ? false : [ResolvedReturnType<Fn>] extends [undefined] ? true : false

export type ResolvesToVoid<Fn extends MethodFn> = [Promise<ResolvedReturnType<Fn>>] extends [Promise<void>]
    ? true
    : false

export type RpcResult<Fn extends MethodFn> =
    ResolvesToUndefined<Fn> extends true
        ? null
        : ResolvesToVoid<Fn> extends true
          ? ResolvedReturnType<Fn>
          : undefined extends ResolvedReturnType<Fn>
            ? Exclude<ResolvedReturnType<Fn>, undefined> | null
            : ResolvedReturnType<Fn>

export type RpcChannelMethod<Fn extends MethodFn> = ((...args: Parameters<Fn>) => Promise<RpcResult<Fn>>) &
    (ResolvesToVoid<Fn> extends true ? RpcNotifiable<Fn> : unknown)

export type RpcHandleableName<Events extends MethodMap<Events>> = Exclude<keyof Events, ReservedMethodName>

export type RpcObservableEvents<Events extends MethodMap<Events>> = Pick<Events, RpcHandleableName<Events>> &
    RpcChannelEvents

export interface RpcChannelMeta<Events extends MethodMap<Events>> {
    readonly status: ConnectionStatus
    handle<Name extends RpcHandleableName<Events>>(name: Name, handler: RpcHandler<Events[Name]>): Unsubscribe
    on<Name extends keyof RpcObservableEvents<Events>>(
        name: Name,
        listener: RpcListener<RpcObservableEvents<Events>[Name]>,
    ): Unsubscribe
    destroy(): void
}

export type RpcChannel<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> = {
    [Method in Exclude<keyof Methods, UncallableMethodName>]: RpcChannelMethod<Methods[Method]>
} & {
    readonly $: RpcChannelMeta<Events>
}
