import { PublicEventEmitter } from './EventEmitter'
import { MethodFn, InternalMethodMap } from './MethodMap'
import { AnyRpcEvents } from '@/constants/DEFAULT_EVENTS'

// Always returns a promise which is not obligatory for passed generic methods
export type RpcChannelMethod<Fn extends MethodFn> = (...args: Parameters<Fn>) => Promise<Awaited<ReturnType<Fn>>>

export type RpcChannel<
    Methods extends InternalMethodMap<Methods>,
    Events extends InternalMethodMap<Events>,
> = PublicEventEmitter<Events & AnyRpcEvents> & {
    [Method in keyof Methods]: RpcChannelMethod<Methods[Method]>
}
