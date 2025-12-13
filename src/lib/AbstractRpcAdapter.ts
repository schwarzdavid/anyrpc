import { RpcMessage } from '@/types/RpcMessages'
import { MethodMap } from '@/types/MethodMap'

export type MessageHandler = (message: string | object) => Promise<void>
export type ConnectionHandler = () => unknown

export abstract class AbstractRpcAdapter<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
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

    protected onConnection() {
        this._connectionHandler?.()
    }
}
