import { AbstractRpcAdapter } from '@/lib/AbstractRpcAdapter'
import { MethodMap } from '@/types/MethodMap'
import { RpcMessage } from '@/types/RpcMessages'

export interface IFrameAdapterOptions {
    postMessageOrigin: string
}

export abstract class AbstractIFrameAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractRpcAdapter<Methods, Events> {
    protected static readonly INIT_METHOD_NAME = 'init'
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
        this.onConnection()
    }

    sendMessage(message: RpcMessage<Methods, Events>): void {
        this._port?.postMessage(message)
    }
}
