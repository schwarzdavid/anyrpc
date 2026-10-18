import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortHostAdapter } from '@/lib/adapter/message-port/AbstractMessagePortHostAdapter'
import type { HeartbeatOption } from '@/lib/Heartbeat'
import type { InitResponse } from '@/utils/message-port/handshake'
import { DEFAULT_IFRAME_ADAPTER_NAME, IFRAME_INIT_METHOD_NAME, type IFrameAdapterOptions } from './iframeHandshake'
import { assertValidOriginOption, type IFrameOriginOption, isOriginAllowed } from './iframeOrigin'

export interface IFrameHostAdapterOptions extends IFrameAdapterOptions {
    reconnect: boolean
    heartbeat: HeartbeatOption
    origin: IFrameOriginOption
}

export class IFrameHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortHostAdapter<Methods, Events> {
    private readonly postMessageOrigin: string
    private readonly reconnect: boolean
    private readonly allowedOrigin: IFrameOriginOption

    constructor(
        private readonly iframe: HTMLIFrameElement,
        name: string = DEFAULT_IFRAME_ADAPTER_NAME,
        options?: Partial<IFrameHostAdapterOptions>,
    ) {
        assertValidOriginOption(options?.origin)

        super(IFRAME_INIT_METHOD_NAME, name, options?.heartbeat ?? false)
        this.postMessageOrigin = options?.postMessageOrigin ?? '*'
        this.reconnect = options?.reconnect ?? true
        this.allowedOrigin = options?.origin ?? true
    }

    override connect(): void {
        if (this.allowedOrigin === true) {
            this.logger?.warn(
                'Accepting handshake requests from any origin. Set the "origin" option for production use.',
            )
        }
        super.connect()
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
        if (!isOriginAllowed(this.allowedOrigin, event.origin)) {
            if (this.isExpectedInitRequest(event.data)) {
                this.logger?.warn(`Ignored the handshake request from "${event.origin}": origin not allowed`)
            }
            return
        }
        if (this.acceptInitRequest(event.data) && !this.reconnect) {
            this.stopListening()
        }
    }
}
