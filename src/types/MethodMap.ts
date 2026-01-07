import { DefaultEvents } from '@/constants/DEFAULT_EVENTS'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MethodFn = (...data: any[]) => any

export type InternalMethodMap<Events, Forbidden extends string = string> = {
    [K in keyof Events as Exclude<K, Forbidden>]: MethodFn
}

export type MethodMap<Events, Forbidden extends string = string> = InternalMethodMap<
    Events,
    Forbidden | keyof DefaultEvents
>
