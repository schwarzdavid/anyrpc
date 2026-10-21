import { Heartbeat, type HeartbeatOptions } from '@/lib/Heartbeat'
import { type ControlMessage, ControlMethod, createControlMessage, readControlMethod } from '@/utils/controlMessages'

export interface ControlProtocolCallbacks {
    send(message: ControlMessage): void
    onPong(): void
    onTimeout(): void
    onGoodbye(): void
}

export class ControlProtocol {
    private readonly heartbeat: Heartbeat | undefined

    constructor(
        heartbeatOptions: HeartbeatOptions | undefined,
        private readonly callbacks: ControlProtocolCallbacks,
    ) {
        if (heartbeatOptions) {
            this.heartbeat = new Heartbeat(heartbeatOptions, {
                ping: () => this.ping(),
                onTimeout: () => this.callbacks.onTimeout(),
            })
        }
    }

    handle(data: unknown): boolean {
        switch (readControlMethod(data)) {
            case ControlMethod.PING:
                this.send(ControlMethod.PONG)
                return true
            case ControlMethod.PONG:
                this.heartbeat?.acknowledge()
                this.callbacks.onPong()
                return true
            case ControlMethod.GOODBYE:
                this.callbacks.onGoodbye()
                return true
            default:
                return false
        }
    }

    ping(): void {
        this.send(ControlMethod.PING)
    }

    sayGoodbye(): void {
        this.send(ControlMethod.GOODBYE)
    }

    startHeartbeat(): void {
        this.heartbeat?.start()
    }

    stopHeartbeat(): void {
        this.heartbeat?.stop()
    }

    private send(method: ControlMethod): void {
        this.callbacks.send(createControlMessage(method))
    }
}
