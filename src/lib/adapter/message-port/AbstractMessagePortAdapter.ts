import { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import type { MethodMap } from '@/types/MethodMap'
import type { RpcMessage } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { readMessageData } from '@/lib/adapter/message-port/utils/messageData'
import type { HeartbeatOptions } from '@/lib/Heartbeat'
import { ControlProtocol } from '@/lib/ControlProtocol'

export interface MessagePortLike {
    postMessage(message: unknown): void
    addEventListener(type: 'message' | 'messageerror', listener: (event: Event) => void): void
    start(): void
    close(): void
}

export interface MessagePorts {
    data: MessagePortLike
    control?: MessagePortLike
}

export interface AttachPortsOptions {
    awaitRemote: boolean
}

export abstract class AbstractMessagePortAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractRpcAdapter<Methods, Events> {
    private ports: MessagePorts | undefined
    private awaitingRemote = false
    private readonly control: ControlProtocol

    protected constructor(heartbeatOptions?: HeartbeatOptions) {
        super()

        this.control = new ControlProtocol(heartbeatOptions, {
            send: (message) => this.ports?.control?.postMessage(message),
            onPong: () => this.markResponsive(),
            onTimeout: () => this.markUnresponsive(),
            onGoodbye: () => this.handleRemoteGoodbye(),
        })
    }

    sendMessage(message: RpcMessage<Methods, Events>): void {
        this.ports?.data.postMessage(message)
    }

    protected attachPorts(ports: MessagePorts, { awaitRemote = false }: Partial<AttachPortsOptions> = {}): void {
        if (this.ports) {
            this.closePorts()
            this.closeConnection()
        }
        this.ports = ports

        ports.data.addEventListener('message', (event) => void this.onMessage(readMessageData(event) as object))
        ports.data.addEventListener('messageerror', () =>
            this.logger?.warn('Dropped a message that could not be deserialized'),
        )
        ports.data.start()
        ports.control?.addEventListener('message', (event) => this.onControlMessage(readMessageData(event)))
        ports.control?.start()

        if (awaitRemote) {
            this.awaitingRemote = true
            this.control.ping()
        } else {
            this.connectionStatus = ConnectionStatus.CONNECTED
        }
        if (ports.control) {
            this.control.startHeartbeat()
        }
    }

    protected onRemoteGoodbye(): void {
        this.closePorts()
        this.closeConnection()
    }

    override destroy(): void {
        this.control.sayGoodbye()
        this.closePorts()
        super.destroy()
    }

    private onControlMessage(data: unknown): void {
        if (!this.control.handle(data)) {
            this.logger?.warn('Ignored an unknown control message', data)
        }
    }

    private handleRemoteGoodbye(): void {
        this.logger?.debug('The remote side closed the connection')
        this.onRemoteGoodbye()
    }

    private markResponsive(): void {
        if (this.connectionStatus === ConnectionStatus.CONNECTED) {
            return
        }
        this.logger?.info(
            this.awaitingRemote ? 'The remote side accepted the connection' : 'The remote side is responding again',
        )
        this.awaitingRemote = false
        this.connectionStatus = ConnectionStatus.CONNECTED
    }

    protected onRemoteUnresponsive(): void {
        this.connectionStatus = ConnectionStatus.DISCONNECTED
    }

    private markUnresponsive(): void {
        if (this.connectionStatus === ConnectionStatus.CONNECTED) {
            this.logger?.warn('The remote side did not answer the heartbeat in time')
            this.onRemoteUnresponsive()
        }
    }

    private closePorts(): void {
        this.control.stopHeartbeat()
        this.awaitingRemote = false
        this.ports?.data.close()
        this.ports?.control?.close()
        this.ports = undefined
    }
}
