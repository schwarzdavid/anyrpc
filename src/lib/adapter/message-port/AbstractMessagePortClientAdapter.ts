import { AbstractMessagePortAdapter } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'
import type { MethodMap } from '@/types/MethodMap'
import { createInitRequest, type InitRequest, isInitResponse } from '@/utils/message-port/handshake'

interface Handshake {
    request: InitRequest
    listeners: AbortController
    pollingIntervalId: ReturnType<typeof setInterval>
}

export abstract class AbstractMessagePortClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortAdapter<Methods, Events> {
    private handshake: Handshake | undefined

    protected constructor(
        private readonly initMethod: string,
        private readonly name: string,
        private readonly pollingInterval: number,
    ) {
        super()
    }

    connect(): void {
        this.stopHandshake()

        const request = createInitRequest(this.initMethod, this.name)
        const listeners = new AbortController()

        this.listenForInitResponses(listeners.signal)
        this.handshake = {
            request,
            listeners,
            pollingIntervalId: setInterval(() => this.postInitRequest(request), this.pollingInterval),
        }
        this.postInitRequest(request)
    }

    protected abstract listenForInitResponses(signal: AbortSignal): void

    protected abstract postInitRequest(request: InitRequest): void

    protected acceptInitResponse(event: MessageEvent): void {
        if (!this.handshake || !isInitResponse(event.data, this.handshake.request.id)) {
            return
        }
        const [data, control] = event.ports
        if (!data || !control) {
            this.logger?.warn('Ignored a handshake response without the expected message ports')
            return
        }
        this.stopHandshake()
        this.attachPorts({ data, control })
    }

    protected override onRemoteGoodbye(): void {
        super.onRemoteGoodbye()
        this.connect()
    }

    private stopHandshake(): void {
        this.handshake?.listeners.abort()
        clearInterval(this.handshake?.pollingIntervalId)
        this.handshake = undefined
    }

    override destroy(): void {
        this.stopHandshake()
        super.destroy()
    }
}
