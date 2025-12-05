import { AbstractRpcAdapter } from '@/lib/AbstractRpcAdapter'
import { MethodMap } from '@/types/MethodMap'
import { RpcMessage } from '@/types/RpcMessages'

export interface IFrameAdapterOptions {
    origin: string
}

export abstract class AbstractIFrameAdapter<
    Methods extends MethodMap,
    Events extends MethodMap,
> extends AbstractRpcAdapter<Methods, Events> {
    protected static readonly INIT_METHOD_NAME = 'init'
    protected static readonly DEFAULT_NAME = 'anyrpc-iframe-adapter'

    private _port: MessagePort | undefined
    protected readonly origin: string

    protected constructor(options?: Partial<IFrameAdapterOptions>) {
        super()

        this.origin = options?.origin ?? '/'
    }

    protected set port(port: MessagePort | undefined) {
        this._port = port
        this._port?.addEventListener('message', (event) => this.onMessage(event.data as object))
    }

    sendMessage(message: RpcMessage): void {
        this._port?.postMessage(message)
    }
}
