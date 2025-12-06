import { MethodMap } from '@/types/MethodMap'
import { AbstractIFrameAdapter, IFrameAdapterOptions } from './AbstractIFrameAdapter'
import { RpcRequest } from '@/types/RpcMessages'
import { uuid } from '@/utils/uuid'

/* eslint-disable @typescript-eslint/no-this-alias */

export interface IFrameClientAdapterOptions extends IFrameAdapterOptions {
    pollingInterval: number
}

export class IFrameClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractIFrameAdapter<Methods, Events> {
    private readonly pollingInterval: number

    constructor(
        private readonly name: string = AbstractIFrameAdapter.DEFAULT_NAME,
        options?: Partial<IFrameClientAdapterOptions>,
    ) {
        super(options)
        this.pollingInterval = options?.pollingInterval ?? 1000

        this.establishConnection()
    }

    private establishConnection() {
        const adapter = this
        const messageIntervalId = setInterval(() => this.sendInitMessage(), this.pollingInterval)

        window.addEventListener('message', function onWindowMessage(event) {
            adapter.port = event.ports[0]

            clearInterval(messageIntervalId)
            window.removeEventListener('message', onWindowMessage)
        })

        this.sendInitMessage()
    }

    private sendInitMessage() {
        window.parent.postMessage(
            {
                id: uuid(),
                method: AbstractIFrameAdapter.INIT_METHOD_NAME,
                params: [this.name],
                jsonrpc: '2.0',
            } satisfies RpcRequest<{
                [AbstractIFrameAdapter.INIT_METHOD_NAME]: (args: string) => void
            }>,
            this.origin,
        )
    }
}
