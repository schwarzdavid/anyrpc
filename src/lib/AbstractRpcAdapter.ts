import type { RpcMessage } from '@/types/RpcMessages'
import type { MethodMap } from '@/types/MethodMap'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import type { Promisable } from 'type-fest'
import { Logger } from '@/lib/Logger'
import type { LogLevel } from '@/types/LogLevel'

export type MessageHandler = (message: string | object) => Promisable<void>
export type ConnectionHandler = (status: ConnectionStatus) => Promisable<unknown>

export abstract class AbstractRpcAdapter<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    private _messageHandler?: MessageHandler
    private _connectionHandler?: ConnectionHandler
    private _connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED
    protected logger?: Logger

    get connectionStatus(): ConnectionStatus {
        return this._connectionStatus
    }

    protected set connectionStatus(status: ConnectionStatus) {
        this._connectionStatus = status
        this._connectionHandler?.(status)
    }

    set connectionHandler(handler: ConnectionHandler) {
        this._connectionHandler = handler
    }

    set messageHandler(handler: MessageHandler) {
        this._messageHandler = handler
    }

    abstract connect(): Promisable<void>

    abstract sendMessage(message: RpcMessage<Methods, Events>): void

    protected async onMessage(rawMessage: string | object): Promise<void> {
        await this._messageHandler?.(rawMessage)
    }

    initLogger(logLevel: LogLevel): void {
        this.logger = new Logger(this.constructor.name, logLevel)
    }

    destroy(): void {
        this.connectionStatus = ConnectionStatus.DISCONNECTED
    }
}
