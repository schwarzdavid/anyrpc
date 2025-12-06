import { MethodFn, MethodMap } from '@/types/MethodMap'
import { EventListenerCallback, PublicEventEmitter, EventListenerOptions } from '@/types/EventEmitter'

export interface EventListenerEntry<Listener extends MethodFn, Passive extends boolean = boolean> {
    passive: Passive
    listener: EventListenerCallback<Listener, Passive>
}

export type EventListenerRegistry<Events extends MethodMap<Events>> = {
    [K in keyof Events]: EventListenerEntry<Events[K]>[]
}

export interface EventDispatchResult<Fn extends MethodFn> {
    result?: Awaited<ReturnType<Fn>> | undefined
    error?: Error
}

export class EventEmitter<Events extends MethodMap<Events>> implements PublicEventEmitter<Events> {
    private readonly registry = {} as EventListenerRegistry<Events>

    addEventListener<Event extends keyof Events, Passive extends boolean = false>(
        type: Event,
        listener: EventListenerCallback<Events[Event], Passive>,
        options?: EventListenerOptions<Passive>,
    ): void {
        if (!Array.isArray(this.registry[type])) {
            this.registry[type] = []
        }
        if (!options?.passive) {
            const areNonPassiveListenersRegistered = this.registry[type].some((entry) => !entry.passive)
            if (areNonPassiveListenersRegistered) {
                throw new Error('Only one non-passive listener can be registered for an event type')
            }
        }
        this.registry[type].push({
            passive: !!options?.passive,
            listener,
        })
    }

    removeEventListener<Event extends keyof Events>(
        type: Event,
        listener: EventListenerCallback<Events[Event], boolean>,
    ): void {
        if (!Array.isArray(this.registry[type])) {
            return
        }
        const listenerIndex = this.registry[type].findIndex((entry) => entry.listener === listener)
        if (listenerIndex >= 0) {
            this.registry[type].splice(listenerIndex, 1)
        }
    }

    async dispatchEvent<Event extends keyof Events>(
        type: Event,
        params: Parameters<Events[Event]>,
    ): Promise<EventDispatchResult<Events[Event]>> {
        if (!Array.isArray(this.registry[type])) {
            return { result: undefined }
        }
        let activeListener: EventListenerCallback<Events[Event], false> | undefined
        for (const { listener, passive } of this.registry[type]) {
            if (passive) {
                listener(...params)
            } else {
                activeListener = listener
            }
        }

        const output: EventDispatchResult<Events[Event]> = {
            result: undefined,
        }

        if (!activeListener) {
            return output
        }

        try {
            output.result = await activeListener(...params)
        } catch (err) {
            output.error = err as Error
        }

        return output
    }
}
