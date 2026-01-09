import { InternalMethodMap } from '@/types/MethodMap'
import { AbstractIFrameAdapter, IFrameAdapterOptions } from './AbstractIFrameAdapter'
import { RpcSuccessResponse } from '@/types/RpcMessages'
import { uuid } from '@/utils/uuid'

/* eslint-disable @typescript-eslint/no-this-alias */

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
    Methods extends InternalMethodMap<Methods>,
    Events extends InternalMethodMap<Events>,
> extends AbstractIFrameAdapter<Methods, Events> {
    private readonly pollingInterval: number
    private readonly usedInitIds = new Set<string>()
    private readonly allowedOrigin: IFrameClientAdapterOriginOption

    private pollingIntervalId: number | null = null
    private messageEventListener: ((event: MessageEvent) => void) | null = null

    constructor(
        private readonly name: string = AbstractIFrameAdapter.DEFAULT_NAME,
        options?: Partial<IFrameClientAdapterOptions>,
    ) {
        if (Array.isArray(options?.origin) && !options.origin.length) {
            throw new Error('Origin option cannot be an empty array')
        }

        super(options)
        this.pollingInterval = options?.pollingInterval ?? 1000
        this.allowedOrigin = options?.origin ?? true

        this.establishConnection()
    }

    private establishConnection() {
        const adapter = this

        this.messageEventListener = (event: MessageEvent) => {
            if (event.source !== window.parent || !adapter.isInitResponse(event.data)) {
                return
            }
            if (!adapter.isOriginValid(window.parent.origin)) {
                return
            }
            const receivedPort = event.ports[0]
            if (!receivedPort) {
                console.warn('No port received from iframe')
                return
            }

            adapter.port = receivedPort

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            window.clearInterval(this.pollingIntervalId!)
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            window.removeEventListener('message', this.messageEventListener!)
        }

        window.addEventListener('message', this.messageEventListener)

        this.pollingIntervalId = window.setInterval(() => this.sendInitMessage(), this.pollingInterval)
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
            },
            this.postMessageOrigin,
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

    private isOriginValid(url: string) {
        if (this.allowedOrigin === true) {
            // TODO: add warning that all origins are allowed which is not recommended
            return true
        }

        const { origin } = new URL(url)
        if (typeof this.allowedOrigin === 'function') {
            return this.allowedOrigin(origin)
        }
        const allowedOriginsArray = Array.isArray(this.allowedOrigin) ? this.allowedOrigin : [this.allowedOrigin]

        return allowedOriginsArray.some((allowedOrigin) => {
            if (allowedOrigin instanceof RegExp) {
                return allowedOrigin.test(origin)
            }
            return allowedOrigin.toLowerCase().trim() === origin.toLowerCase().trim()
        })
    }

    override destroy(): void {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        window.clearInterval(this.pollingIntervalId!)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        window.removeEventListener('message', this.messageEventListener!)
        super.destroy()
    }
}
