import type { MethodFn } from './MethodMap'
import type { Promisable } from 'type-fest'

export type Unsubscribe = () => void

export type RpcListener<Fn extends MethodFn> = (...args: Parameters<Fn>) => unknown

export type RpcHandler<Fn extends MethodFn> = (...args: Parameters<Fn>) => Promisable<Awaited<ReturnType<Fn>>>
