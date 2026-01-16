import type { PublicEventEmitter } from './EventEmitter'
import type { MethodFn, MethodMap } from './MethodMap'
import { ConnectionStatus } from './ConnectionStatus'
import type { AnyRpcEvents } from '@/constants/DEFAULT_EVENTS'

// Always returns a promise which is not obligatory for passed generic methods
export type RpcChannelMethod<Fn extends MethodFn> = (...args: Parameters<Fn>) => Promise<Awaited<ReturnType<Fn>>>

export interface RpcChannelMeta extends PublicEventEmitter<AnyRpcEvents> {
    readonly status: ConnectionStatus
    destroy(): void
}

export type RpcChannel<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> = PublicEventEmitter<Events> & {
    [Method in keyof Methods]: RpcChannelMethod<Methods[Method]>
} & {
    readonly $: RpcChannelMeta
}
