import { MethodMap } from '@/types/MethodMap'
import { AbstractIFrameAdapter, IFrameAdapterOptions } from './AbstractIFrameAdapter'
import { RpcRequest, RpcSuccessResponse } from '@/types/RpcMessages'
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
    private readonly usedInitIds = new Set<string>()

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
            if (event.source !== window.parent || !adapter.isInitResponse(event.data)) {
                return
            }
            const receivedPort = event.ports[0]
            if (!receivedPort) {
                console.warn('No port received from iframe')
                return
            }

            adapter.port = receivedPort

            clearInterval(messageIntervalId)
            window.removeEventListener('message', onWindowMessage)
        })

        this.sendInitMessage()
    }

    private sendInitMessage() {
        const id = uuid()

        this.usedInitIds.add(id)

        window.parent.postMessage(
            {
                id,
                method: AbstractIFrameAdapter.INIT_METHOD_NAME,
                params: [this.name],
                jsonrpc: '2.0',
            } satisfies RpcRequest<{
                [AbstractIFrameAdapter.INIT_METHOD_NAME]: (args: string) => void
            }>,
            this.origin,
        )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isInitResponse(message: any): message is RpcSuccessResponse<() => null> {
        if (typeof message !== 'object' || message === null) {
            return false
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument
        return message.jsonrpc === '2.0' && message.result === null && this.usedInitIds.has(message.id)
    }
}
