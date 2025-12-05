import { MethodMap } from '@/types/MethodMap'
import { AbstractIFrameAdapter, IFrameAdapterOptions } from './AbstractIFrameAdapter'
import { parseRpcMessage, RpcMessageType, RpcParsingResult } from '@/utils/rpc'
import { RpcResponse } from '@/types/RpcMessages'

export class IFrameHostAdapter<Methods extends MethodMap, Events extends MethodMap> extends AbstractIFrameAdapter<
    Methods,
    Events
> {
    constructor(
        private readonly iframe: HTMLIFrameElement,
        private readonly name: string = AbstractIFrameAdapter.DEFAULT_NAME,
        options?: Partial<IFrameAdapterOptions>,
    ) {
        super(options)
    }

    private establishConnection() {
        const adapter = this

        window.addEventListener('message', function onWindowMessage(event) {
            if (event.source !== adapter.iframe.contentWindow) {
                return
            }

            let result: RpcParsingResult
            try {
                result = parseRpcMessage(event.data)
            } catch (err) {
                // Ignore invalid messages as they might be sent for other purposes
                return
            }
            if (
                result.type !== RpcMessageType.REQUEST ||
                result.message.method !== AbstractIFrameAdapter.INIT_METHOD_NAME
            ) {
                return
            }
            const targetName = result.message.params?.[0]
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
                } satisfies RpcResponse,
                this.origin,
                [messageChannel.port2],
            )
            window.removeEventListener('message', onWindowMessage)
        })
    }
}
