import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortClientAdapter } from '@/lib/adapter/message-port/AbstractMessagePortClientAdapter'
import type { InitRequest } from '@/utils/message-port/handshake'
import { DEFAULT_IFRAME_ADAPTER_NAME, IFRAME_INIT_METHOD_NAME, type IFrameAdapterOptions } from './iframeHandshake'

export type IFrameClientAdapterOriginOption =
    | string
    | RegExp
    | (string | RegExp)[]
    | ((origin: string) => boolean)
    | true

export interface IFrameClientAdapterOptions extends IFrameAdapterOptions {
    pollingInterval: number
    origin: IFrameClientAdapterOriginOption
}

export class IFrameClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortClientAdapter<Methods, Events> {
    private readonly postMessageOrigin: string
    private readonly allowedOrigin: IFrameClientAdapterOriginOption

    constructor(name: string = DEFAULT_IFRAME_ADAPTER_NAME, options?: Partial<IFrameClientAdapterOptions>) {
        if (Array.isArray(options?.origin) && !options.origin.length) {
            throw new Error('Origin option cannot be an empty array')
        }

        super(IFRAME_INIT_METHOD_NAME, name, options?.pollingInterval ?? 1000)
        this.postMessageOrigin = options?.postMessageOrigin ?? '*'
        this.allowedOrigin = options?.origin ?? true
    }

    override connect(): void {
        if (this.allowedOrigin === true) {
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
        window.parent.postMessage(request, this.postMessageOrigin)
    }

    private handleWindowMessage(event: MessageEvent): void {
        if (event.source === window.parent && this.isOriginAllowed(event.origin)) {
            this.acceptInitResponse(event)
        }
    }

    private isOriginAllowed(origin: string): boolean {
        if (this.allowedOrigin === true) {
            return true
        }
        if (typeof this.allowedOrigin === 'function') {
            return this.allowedOrigin(origin)
        }
        const allowedOrigins = Array.isArray(this.allowedOrigin) ? this.allowedOrigin : [this.allowedOrigin]

        return allowedOrigins.some((allowedOrigin) =>
            allowedOrigin instanceof RegExp
                ? allowedOrigin.test(origin)
                : allowedOrigin.toLowerCase().trim() === origin.toLowerCase().trim(),
        )
    }
}
