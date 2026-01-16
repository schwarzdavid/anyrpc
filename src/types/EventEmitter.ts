import type { MethodFn, MethodMap } from './MethodMap'
import type { Promisable } from 'type-fest'

export interface EventListenerOptions<Passive extends boolean> {
    passive?: Passive
}

export type EventListenerCallback<Listener extends MethodFn, Passive extends boolean> = (
    ...args: Parameters<Listener>
) => Passive extends true ? unknown : Promisable<Awaited<ReturnType<Listener>>>

export interface PublicEventEmitter<Events extends MethodMap<Events>> {
    addEventListener<Event extends keyof Events, Passive extends boolean = false>(
        type: Event,
        listener: EventListenerCallback<Events[Event], Passive>,
        options?: EventListenerOptions<Passive>,
    ): void

    removeEventListener<Event extends keyof Events>(
        type: Event,
        listener: EventListenerCallback<Events[Event], boolean>,
    ): void
}
