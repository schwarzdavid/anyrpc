import {MethodFn, MethodMap} from "../types/MethodMap";
import {EventListenerCallback, PublicEventEmitter, EventListenerOptions} from "../types/EventEmitter";

interface EventListenerEntry<Listener extends MethodFn, Passive extends boolean = boolean> {
    passive: Passive,
    listener: EventListenerCallback<Listener, Passive>
}

type EventListenerRegistry<Events extends MethodMap> = {
    [K in keyof Events]: EventListenerEntry<Events[K]>[]
}

export class EventEmitter<Events extends MethodMap> implements PublicEventEmitter<Events> {
    private readonly registry = {} as EventListenerRegistry<Events>

    addEventListener<Event extends keyof Events, Passive extends boolean = false>(
        type: Event,
        listener: EventListenerCallback<Events[Event], Passive>,
        options?: EventListenerOptions<Passive>
    ): void {
        if(!Array.isArray(this.registry[type])) {
            this.registry[type] = []
        }
        if(!options?.passive) {
            const areNonPassiveListenersRegistered = this.registry[type].some(entry => !entry.passive)
            if(areNonPassiveListenersRegistered) {
                throw new Error('Only one non-passive listener can be registered for an event type')
            }
        }
        this.registry[type].push({
            passive: !!options?.passive,
            listener
        })
    }

    removeEventListener<Event extends keyof Events>(type: Event, listener: EventListenerCallback<Events[Event], boolean>): void {
        if(!Array.isArray(this.registry[type])) {
            return
        }
        const listenerIndex = this.registry[type].findIndex(entry => entry.listener === listener)
        if(listenerIndex >= 0) {
            this.registry[type].splice(listenerIndex, 1)
        }
    }

    async dispatchEvent<Event extends keyof Events>(type: Event, params: Parameters<Events[Event]>): Promise<ReturnType<Events[Event]> | undefined> {
        if(!Array.isArray(this.registry[type])) {
            return
        }
        let output: Awaited<ReturnType<Events[Event]>> | undefined = undefined
        for(const {listener, passive} of this.registry[type]) {
            const result = await listener(...params)
            if(!passive) {
                output = result
            }
        }
        return output
    }
}
