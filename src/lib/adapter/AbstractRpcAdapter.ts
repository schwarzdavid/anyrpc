import type { RpcMessage } from '@/types/RpcMessages'
import type { MethodMap } from '@/types/MethodMap'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import type { Promisable } from '@/types/Promisable'
import { Logger } from '@/lib/Logger'
import { ConnectionLifecycle } from '@/lib/ConnectionLifecycle'
import type { LogLevel } from '@/types/LogLevel'

export type MessageHandler = (message: string | object) => Promisable<void>
export type ConnectionHandler = (status: ConnectionStatus) => Promisable<unknown>
export type ConnectionLostHandler = () => void

export interface RpcAdapterBinding {
    onMessage: MessageHandler
    onStatusChange: ConnectionHandler
    onConnectionLost: ConnectionLostHandler
    logLevel: LogLevel
}

export abstract class AbstractRpcAdapter<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    private binding: RpcAdapterBinding | undefined
    private readonly lifecycle = new ConnectionLifecycle((status) => this.binding?.onStatusChange(status))
    protected readonly logName: string = 'RpcAdapter'
    protected logger?: Logger

    get connectionStatus(): ConnectionStatus {
        return this.lifecycle.status
    }

    protected set connectionStatus(status: ConnectionStatus) {
        this.lifecycle.transitionTo(status)
    }

    bind(binding: RpcAdapterBinding): void {
        this.binding = binding
        this.logger = new Logger(this.logName, binding.logLevel)
    }

    abstract connect(): Promisable<void>

    abstract sendMessage(message: RpcMessage<Methods, Events>): void

    protected async onMessage(rawMessage: string | object): Promise<void> {
        await this.binding?.onMessage(rawMessage)
    }

    protected closeConnection(): void {
        this.endConnection(ConnectionStatus.DISCONNECTED)
    }

    destroy(): void {
        this.endConnection(ConnectionStatus.DESTROYED)
    }

    private endConnection(status: ConnectionStatus): void {
        if (this.lifecycle.isDestroyed) {
            return
        }
        this.binding?.onConnectionLost()
        this.lifecycle.transitionTo(status)
    }
}
