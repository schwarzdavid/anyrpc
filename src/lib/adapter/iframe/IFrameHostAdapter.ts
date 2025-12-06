import { MethodMap } from '@/types/MethodMap'
import { AbstractIFrameAdapter, IFrameAdapterOptions } from './AbstractIFrameAdapter'
import { parseRpcMessage, RpcMessageType, RpcParsingResult } from '@/utils/rpc'
import { RpcSuccessResponse } from '@/types/RpcMessages'

/* eslint-disable @typescript-eslint/no-this-alias */

export class IFrameHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractIFrameAdapter<Methods, Events> {
    constructor(
        private readonly iframe: HTMLIFrameElement,
        private readonly name: string = AbstractIFrameAdapter.DEFAULT_NAME,
        options?: Partial<IFrameAdapterOptions>,
    ) {
        super(options)

        this.establishConnection()
    }

    private establishConnection() {
        const adapter = this

        window.addEventListener('message', function onWindowMessage(event) {
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
                this.origin,
                [messageChannel.port2],
            )
            window.removeEventListener('message', onWindowMessage)
        })
    }
}
