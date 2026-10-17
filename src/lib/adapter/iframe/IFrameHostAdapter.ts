import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortHostAdapter } from '@/lib/adapter/message-port/AbstractMessagePortHostAdapter'
import type { HeartbeatOption } from '@/lib/Heartbeat'
import type { InitResponse } from '@/utils/message-port/handshake'
import { DEFAULT_IFRAME_ADAPTER_NAME, IFRAME_INIT_METHOD_NAME, type IFrameAdapterOptions } from './iframeHandshake'

export interface IFrameHostAdapterOptions extends IFrameAdapterOptions {
    reconnect: boolean
    heartbeat: HeartbeatOption
}

export class IFrameHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortHostAdapter<Methods, Events> {
    private readonly postMessageOrigin: string
    private readonly reconnect: boolean

    constructor(
        private readonly iframe: HTMLIFrameElement,
        name: string = DEFAULT_IFRAME_ADAPTER_NAME,
        options?: Partial<IFrameHostAdapterOptions>,
    ) {
        super(IFRAME_INIT_METHOD_NAME, name, options?.heartbeat ?? false)
        this.postMessageOrigin = options?.postMessageOrigin ?? '*'
        this.reconnect = options?.reconnect ?? true
    }

    protected listenForInitRequests(signal: AbortSignal): void {
        window.addEventListener('message', (event) => this.handleWindowMessage(event), { signal })
    }

    protected postInitResponse(response: InitResponse, transfer: Transferable[]): void {
        this.iframe.contentWindow?.postMessage(response, this.postMessageOrigin, transfer)
    }

    private handleWindowMessage(event: MessageEvent): void {
        if (event.source !== this.iframe.contentWindow) {
            return
        }
        if (this.acceptInitRequest(event.data) && !this.reconnect) {
            this.stopListening()
        }
    }
}
