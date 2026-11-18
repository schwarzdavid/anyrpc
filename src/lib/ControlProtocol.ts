import { Heartbeat, type HeartbeatOptions } from '@/lib/Heartbeat'
import type { Logger } from '@/lib/Logger'
import { type ControlMessage, ControlMethod, createControlMessage, readControlMethod } from '@/utils/controlMessages'

export interface ControlProtocolHost {
    send(message: ControlMessage): void
    isConnected(): boolean
    getLogger(): Logger | undefined
    onResponsive(): void
    onUnresponsive(): void
    onGoodbye(): void
}

export class ControlProtocol {
    private readonly heartbeat: Heartbeat | undefined
    private awaitingRemote = false

    constructor(
        heartbeatOptions: HeartbeatOptions | undefined,
        private readonly host: ControlProtocolHost,
    ) {
        if (heartbeatOptions) {
            this.heartbeat = new Heartbeat(heartbeatOptions, {
                ping: () => this.send(ControlMethod.PING),
                onTimeout: () => this.handleTimeout(),
            })
        }
    }

    handle(data: unknown): boolean {
        switch (readControlMethod(data)) {
            case ControlMethod.PING:
                this.send(ControlMethod.PONG)
                return true
            case ControlMethod.PONG:
                this.handlePong()
                return true
            case ControlMethod.GOODBYE:
                this.handleGoodbye()
                return true
            default:
                return false
        }
    }

    awaitRemote(): void {
        this.awaitingRemote = true
        this.send(ControlMethod.PING)
    }

    sayGoodbye(): void {
        this.send(ControlMethod.GOODBYE)
    }

    startHeartbeat(): void {
        this.heartbeat?.start()
    }

    stop(): void {
        this.heartbeat?.stop()
        this.awaitingRemote = false
    }

    private handlePong(): void {
        this.heartbeat?.acknowledge()

        if (this.host.isConnected()) {
            return
        }
        this.host
            .getLogger()
            ?.info(
                this.awaitingRemote ? 'The remote side accepted the connection' : 'The remote side is responding again',
            )
        this.awaitingRemote = false
        this.host.onResponsive()
    }

    private handleTimeout(): void {
        if (this.host.isConnected()) {
            this.host.getLogger()?.warn('The remote side did not answer the heartbeat in time')
            this.host.onUnresponsive()
        }
    }

    private handleGoodbye(): void {
        this.host.getLogger()?.debug('The remote side closed the connection')
        this.host.onGoodbye()
    }

    private send(method: ControlMethod): void {
        this.host.send(createControlMessage(method))
    }
}
