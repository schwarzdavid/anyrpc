import { RpcMessage } from '@/types/RpcMessages'
import { InternalMethodMap } from '@/types/MethodMap'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { Promisable } from 'type-fest'

export type MessageHandler = (message: string | object) => Promisable<void>
export type ConnectionHandler = (status: ConnectionStatus) => Promisable<unknown>

export abstract class AbstractRpcAdapter<
    Methods extends InternalMethodMap<Methods>,
    Events extends InternalMethodMap<Events>,
> {
    private _messageHandler?: MessageHandler
    private _connectionHandler?: ConnectionHandler

    set connectionHandler(handler: ConnectionHandler) {
        this._connectionHandler = handler
    }

    set messageHandler(handler: MessageHandler) {
        this._messageHandler = handler
    }

    abstract sendMessage(message: RpcMessage<Methods, Events>): unknown

    protected async onMessage(rawMessage: string | object): Promise<void> {
        await this._messageHandler?.(rawMessage)
    }

    protected async onConnectionStatusChange(status: ConnectionStatus): Promise<void> {
        await this._connectionHandler?.(status)
    }

    destroy(): Promisable<void> {
        // Keep for inheritors to override
        return Promise.resolve()
    }
}
