import { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import type { MethodMap } from '@/types/MethodMap'
import type { RpcMessage } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import {
    ControlMethod,
    createControlMessage,
    readControlMethod,
} from '@/lib/adapter/message-port/utils/controlMessages'
import { Heartbeat, type HeartbeatOptions } from '@/lib/Heartbeat'

export interface MessagePorts {
    data: MessagePort
    control?: MessagePort
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
    private readonly heartbeat: Heartbeat | undefined

    protected constructor(heartbeatOptions?: HeartbeatOptions) {
        super()

        if (heartbeatOptions) {
            this.heartbeat = new Heartbeat(heartbeatOptions, {
                ping: () => this.sendControlMessage(ControlMethod.PING),
                onTimeout: () => this.markUnresponsive(),
            })
        }
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

        ports.data.addEventListener('message', (event) => void this.onMessage(event.data as object))
        ports.data.addEventListener('messageerror', () =>
            this.logger?.warn('Dropped a message that could not be deserialized'),
        )
        ports.data.start()
        ports.control?.addEventListener('message', (event) => this.onControlMessage(event.data))
        ports.control?.start()

        if (awaitRemote) {
            this.awaitingRemote = true
            this.sendControlMessage(ControlMethod.PING)
        } else {
            this.connectionStatus = ConnectionStatus.CONNECTED
        }
        if (ports.control) {
            this.heartbeat?.start()
        }
    }

    protected onRemoteGoodbye(): void {
        this.closePorts()
        this.closeConnection()
    }

    override destroy(): void {
        this.sendControlMessage(ControlMethod.GOODBYE)
        this.closePorts()
        super.destroy()
    }

    private onControlMessage(data: unknown): void {
        switch (readControlMethod(data)) {
            case ControlMethod.PING:
                this.sendControlMessage(ControlMethod.PONG)
                break
            case ControlMethod.PONG:
                this.markResponsive()
                break
            case ControlMethod.GOODBYE:
                this.logger?.debug('The remote side closed the connection')
                this.onRemoteGoodbye()
                break
            default:
                this.logger?.warn('Ignored an unknown control message', data)
        }
    }

    private sendControlMessage(method: ControlMethod): void {
        this.ports?.control?.postMessage(createControlMessage(method))
    }

    private markResponsive(): void {
        this.heartbeat?.acknowledge()
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
        this.heartbeat?.stop()
        this.awaitingRemote = false
        this.ports?.data.close()
        this.ports?.control?.close()
        this.ports = undefined
    }
}
