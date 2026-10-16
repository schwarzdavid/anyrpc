import type { RpcHandler, RpcListener, Unsubscribe } from './EventEmitter'
import type { MethodFn, MethodMap } from './MethodMap'
import type { ConnectionStatus } from './ConnectionStatus'
import type { RpcChannelEvents } from './RpcChannelEvents'

export type ReservedMethodName = `rpc.${string}`

export type UncallableMethodName = '$' | 'then' | ReservedMethodName

export interface RpcNotifiable<Fn extends MethodFn> {
    notify(...args: Parameters<Fn>): void
}

export type RpcChannelMethod<Fn extends MethodFn> = ((...args: Parameters<Fn>) => Promise<Awaited<ReturnType<Fn>>>) &
    ([Promise<Awaited<ReturnType<Fn>>>] extends [Promise<void>] ? RpcNotifiable<Fn> : unknown)

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
