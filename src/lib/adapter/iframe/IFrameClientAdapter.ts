import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortClientAdapter } from '@/lib/adapter/message-port/AbstractMessagePortClientAdapter'
import type { InitRequest } from '@/utils/message-port/handshake'
import { DEFAULT_IFRAME_ADAPTER_NAME, IFRAME_INIT_METHOD_NAME } from './iframeHandshake'
import { allowsAnyOrigin, assertValidOriginOption, type IFrameOriginOption, isOriginAllowed } from './iframeOrigin'

export interface IFrameClientAdapterOptions {
    pollingInterval: number
    origin: IFrameOriginOption
}

export class IFrameClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortClientAdapter<Methods, Events> {
    private readonly allowedOrigin: IFrameOriginOption

    constructor(name: string = DEFAULT_IFRAME_ADAPTER_NAME, options?: Partial<IFrameClientAdapterOptions>) {
        assertValidOriginOption(options?.origin)

        super(IFRAME_INIT_METHOD_NAME, name, options?.pollingInterval ?? 1000)
        this.allowedOrigin = options?.origin ?? true
    }

    override connect(): void {
        if (window.parent === window) {
            this.logger?.warn('This page is not embedded in an iframe, so no host can answer the handshake.')
        }
        if (allowsAnyOrigin(this.allowedOrigin)) {
            this.logger?.warn(
                'Accepting handshake responses from any origin. Set the "origin" option for production use.',
            )
        }
        super.connect()
    }

    protected listenForInitResponses(signal: AbortSignal): void {
        window.addEventListener('message', (event) => this.handleWindowMessage(event), { signal })
    }

    protected postInitRequest(request: InitRequest): void {
        window.parent.postMessage(request, '*')
    }

    private handleWindowMessage(event: MessageEvent): void {
        if (event.source !== window.parent) {
            return
        }
        if (isOriginAllowed(this.allowedOrigin, event.origin)) {
            this.acceptInitResponse(event)
            return
        }
        if (this.isExpectedInitResponse(event.data)) {
            this.logger?.warn(`Ignored the handshake response from "${event.origin}": origin not allowed`)
        }
    }
}
