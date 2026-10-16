import type { MethodMap } from '@/types/MethodMap'
import type { RpcListener, Unsubscribe } from '@/types/EventEmitter'

export type ListenerErrorHandler<Events> = (error: unknown, type: keyof Events) => void

export class EventEmitter<Events extends MethodMap<Events>> {
    private readonly listeners = new Map<keyof Events, Set<RpcListener<Events[keyof Events]>>>()

    constructor(private readonly onListenerError: ListenerErrorHandler<Events>) {}

    on<Event extends keyof Events>(type: Event, listener: RpcListener<Events[Event]>): Unsubscribe {
        const listeners = this.listeners.get(type) ?? new Set()
        listeners.add(listener)
        this.listeners.set(type, listeners)

        return () => {
            listeners.delete(listener)
        }
    }

    emit<Event extends keyof Events>(type: Event, params: Parameters<Events[Event]>): void {
        for (const listener of [...(this.listeners.get(type) ?? [])]) {
            this.callListener(type, listener, params)
        }
    }

    private callListener<Event extends keyof Events>(
        type: Event,
        listener: RpcListener<Events[Event]>,
        params: Parameters<Events[Event]>,
    ): void {
        const reportError = (error: unknown) => this.onListenerError(error, type)
        try {
            const result = listener(...params)
            if (result instanceof Promise) {
                result.catch(reportError)
            }
        } catch (error) {
            reportError(error)
        }
    }
}
