import type { RpcMessage } from '@/types/RpcMessages'
import type { MethodMap } from '@/types/MethodMap'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import type { Promisable } from 'type-fest'
import { Logger } from '@/lib/Logger'
import { ConnectionLifecycle } from '@/lib/ConnectionLifecycle'
import type { LogLevel } from '@/types/LogLevel'

export type MessageHandler = (message: string | object) => Promisable<void>
export type ConnectionHandler = (status: ConnectionStatus) => Promisable<unknown>
export type ConnectionLostHandler = () => void

export abstract class AbstractRpcAdapter<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    private _messageHandler?: MessageHandler
    private _connectionHandler?: ConnectionHandler
    private _connectionLostHandler?: ConnectionLostHandler
    private readonly lifecycle = new ConnectionLifecycle((status) => this._connectionHandler?.(status))
    protected logger?: Logger

    get connectionStatus(): ConnectionStatus {
        return this.lifecycle.status
    }

    protected set connectionStatus(status: ConnectionStatus) {
        this.lifecycle.transitionTo(status)
    }

    set connectionHandler(handler: ConnectionHandler) {
        this._connectionHandler = handler
    }

    set connectionLostHandler(handler: ConnectionLostHandler) {
        this._connectionLostHandler = handler
    }

    set messageHandler(handler: MessageHandler) {
        this._messageHandler = handler
    }

    abstract connect(): Promisable<void>

    abstract sendMessage(message: RpcMessage<Methods, Events>): void

    protected async onMessage(rawMessage: string | object): Promise<void> {
        await this._messageHandler?.(rawMessage)
    }

    protected closeConnection(): void {
        this.endConnection(ConnectionStatus.DISCONNECTED)
    }

    initLogger(logLevel: LogLevel): void {
        this.logger = new Logger(this.constructor.name, logLevel)
    }

    destroy(): void {
        this.endConnection(ConnectionStatus.DESTROYED)
    }

    private endConnection(status: ConnectionStatus): void {
        if (this.lifecycle.isDestroyed) {
            return
        }
        this._connectionLostHandler?.()
        this.lifecycle.transitionTo(status)
    }
}
