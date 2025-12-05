import { PublicEventEmitter } from './EventEmitter'
import { MethodFn, MethodMap } from './MethodMap'

// Always returns a promise which is not obligatory for passed generic methods
export type RpcChannelMethod<Fn extends MethodFn> = (...args: Parameters<Fn>) => Promise<ReturnType<Fn> | undefined>

export type RpcChannel<Methods extends MethodMap, Events extends MethodMap> = PublicEventEmitter<Events> & {
    [Method in keyof Methods]: RpcChannelMethod<Methods[Method]>
}
