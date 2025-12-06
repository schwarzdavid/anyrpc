import { RpcMessage } from '@/types/RpcMessages'
import { MethodMap } from '@/types/MethodMap'

export type MessageHandler = (message: string | object) => unknown
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

    protected onMessage(rawMessage: string | object) {
        this._messageHandler?.(rawMessage)
    }

    protected onConnection() {
        this._connectionHandler?.()
    }
}
