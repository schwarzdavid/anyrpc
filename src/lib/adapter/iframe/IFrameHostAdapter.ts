import { InternalMethodMap } from '@/types/MethodMap'
import { AbstractIFrameAdapter, IFrameAdapterOptions } from './AbstractIFrameAdapter'
import { parseRpcMessage, RpcMessageType, RpcParsingResult } from '@/utils/rpc'
import { RpcSuccessResponse } from '@/types/RpcMessages'

/* eslint-disable @typescript-eslint/no-this-alias */

export interface IFrameHostAdapterOptions extends IFrameAdapterOptions {
    reconnect: boolean
}

export class IFrameHostAdapter<
    Methods extends InternalMethodMap<Methods>,
    Events extends InternalMethodMap<Events>,
> extends AbstractIFrameAdapter<Methods, Events> {
    private readonly reconnect: boolean

    private messageEventListener: ((event: MessageEvent) => void) | null = null

    constructor(
        private readonly iframe: HTMLIFrameElement,
        private readonly name: string = AbstractIFrameAdapter.DEFAULT_NAME,
        options?: Partial<IFrameHostAdapterOptions>,
    ) {
        super(options)
        this.reconnect = options?.reconnect ?? true

        this.establishConnection()
    }

    private establishConnection() {
        const adapter = this

        this.messageEventListener = (event: MessageEvent) => {
            if (event.source !== adapter.iframe.contentWindow) {
                return
            }

            let result: RpcParsingResult<Methods, Events>
            try {
                result = parseRpcMessage<Methods, Events>(event.data as object)
            } catch (_) {
                // Ignore invalid messages as they might be sent for other purposes
                return
            }
            if (
                result.type !== RpcMessageType.REQUEST ||
                result.message.method !== AbstractIFrameAdapter.INIT_METHOD_NAME
            ) {
                return
            }
            const targetName = result.message.params[0]
            if (targetName !== adapter.name) {
                return
            }

            const messageChannel = new MessageChannel()

            adapter.port = messageChannel.port1
            adapter.iframe.contentWindow?.postMessage(
                {
                    id: result.message.id,
                    jsonrpc: '2.0',
                    result: null,
                } satisfies RpcSuccessResponse<() => null>,
                adapter.postMessageOrigin,
                [messageChannel.port2],
            )
            if (!adapter.reconnect) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                window.removeEventListener('message', this.messageEventListener!)
            }
        }

        window.addEventListener('message', this.messageEventListener)
    }

    override destroy(): void {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        window.removeEventListener('message', this.messageEventListener!)
        super.destroy()
    }
}
