import { RpcMessage } from '@/types/RpcMessages'
import { MethodMap } from '@/types/MethodMap'

export type MessageHandler = (message: string | object) => unknown
export type ConnectionHandler = () => unknown

// @ts-expect-error generics are used to define event and method types in createRpcChannel but kept here to allow inherited classes to define whether they are suplex or duplex connection
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters,@typescript-eslint/no-unused-vars
export abstract class AbstractRpcAdapter<Methods extends MethodMap, Events extends MethodMap> {
    private _messageHandler?: MessageHandler
    private _connectionHandler?: ConnectionHandler

    set connectionHandler(handler: ConnectionHandler) {
        this._connectionHandler = handler
    }

    set messageHandler(handler: MessageHandler) {
        this._messageHandler = handler
    }

    abstract sendMessage(message: RpcMessage): any

    protected onMessage(rawMessage: string | object) {
        this._messageHandler?.(rawMessage)
    }

    protected onConnection() {
        this._connectionHandler?.()
    }
}
