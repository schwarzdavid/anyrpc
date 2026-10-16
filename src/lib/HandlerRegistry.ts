import type { MethodMap } from '@/types/MethodMap'
import type { RpcHandler, Unsubscribe } from '@/types/EventEmitter'

export class HandlerRegistry<Events extends MethodMap<Events>> {
    private readonly handlers = new Map<keyof Events, RpcHandler<Events[keyof Events]>>()

    register<Name extends keyof Events>(name: Name, handler: RpcHandler<Events[Name]>): Unsubscribe {
        if (this.handlers.has(name)) {
            throw new Error(
                `A handler for "${String(name)}" is already registered. ` +
                    'Call the function returned by the previous handle() before registering a new handler.',
            )
        }
        this.handlers.set(name, handler)

        return () => {
            if (this.handlers.get(name) === handler) {
                this.handlers.delete(name)
            }
        }
    }

    get<Name extends keyof Events>(name: Name): RpcHandler<Events[Name]> | undefined {
        return this.handlers.get(name)
    }
}
