import { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import { ControlProtocol } from '@/lib/ControlProtocol'
import type { HeartbeatOptions } from '@/lib/Heartbeat'
import type { MethodMap } from '@/types/MethodMap'
import type { RpcMessage } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { parseObject } from './utils/parseObject'

export abstract class AbstractSocketAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractRpcAdapter<Methods, Events> {
    private readonly control: ControlProtocol
    private isOpen = false

    protected constructor(heartbeatOptions?: HeartbeatOptions) {
        super()
        this.control = new ControlProtocol(heartbeatOptions, {
            send: (message) => this.sendWhileOpen(message),
            isConnected: () => this.connectionStatus === ConnectionStatus.CONNECTED,
            getLogger: () => this.logger,
            onResponsive: () => {
                this.connectionStatus = ConnectionStatus.CONNECTED
            },
            onUnresponsive: () => this.onRemoteUnresponsive(),
            onGoodbye: () => this.onRemoteGoodbye(),
        })
    }

    sendMessage(message: RpcMessage<Methods, Events>): void {
        this.send(message)
    }

    protected abstract send(message: object): void

    protected opened(): void {
        this.isOpen = true
        this.connectionStatus = ConnectionStatus.CONNECTED
        this.control.startHeartbeat()
    }

    protected closed(): void {
        this.markClosed()
        this.closeConnection()
    }

    protected receive(data: string | object): void {
        if (!this.isOpen) {
            this.logger?.debug('Ignored a message that arrived while the connection was closed')
            return
        }
        const message = typeof data === 'string' ? (parseObject(data) ?? data) : data

        if (!this.control.handle(message)) {
            void this.onMessage(message)
        }
    }

    protected onRemoteGoodbye(): void {
        this.closed()
    }

    protected onRemoteUnresponsive(): void {
        this.connectionStatus = ConnectionStatus.DISCONNECTED
    }

    override destroy(): void {
        this.control.sayGoodbye()
        this.markClosed()
        super.destroy()
    }

    private sendWhileOpen(message: object): void {
        if (this.isOpen) {
            this.send(message)
        }
    }

    private markClosed(): void {
        this.isOpen = false
        this.control.stop()
    }
}
