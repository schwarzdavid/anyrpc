import { AbstractRpcAdapter } from '@/lib/AbstractRpcAdapter'
import { MethodMap } from '@/types/MethodMap'
import { RpcMessage } from '@/types/RpcMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'

export interface IFrameAdapterOptions {
    postMessageOrigin: string
}

const INIT_METHOD_NAME = 'anyrpc::iframe-init'

export interface IFrameAdapterInternals {
    [INIT_METHOD_NAME](name: string): void
}

export type IFrameMethodMap<Events> = MethodMap<Events, keyof IFrameAdapterInternals>

export abstract class AbstractIFrameAdapter<
    Methods extends IFrameMethodMap<Methods>,
    Events extends IFrameMethodMap<Events>,
> extends AbstractRpcAdapter<Methods, Events> {
    protected static readonly INIT_METHOD_NAME = INIT_METHOD_NAME
    protected static readonly DEFAULT_NAME = 'anyrpc-iframe-adapter'

    private _port: MessagePort | undefined
    protected readonly postMessageOrigin: string

    protected constructor(options?: Partial<IFrameAdapterOptions>) {
        super()

        this.postMessageOrigin = options?.postMessageOrigin ?? '*'
    }

    protected set port(port: MessagePort | undefined) {
        this._port = port
        this._port?.addEventListener('message', (event) => void this.onMessage(event.data as object))
        this._port?.start()
        void this.onConnectionStatusChange(ConnectionStatus.CONNECTED)
    }

    sendMessage(message: RpcMessage<Methods, Events> | RpcMessage<IFrameAdapterInternals, Events>): void {
        this._port?.postMessage(message)
    }

    override destroy(): void {
        this._port?.close()
        super.destroy()
    }
}
