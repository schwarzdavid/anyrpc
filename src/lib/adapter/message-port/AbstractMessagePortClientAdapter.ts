import { AbstractMessagePortAdapter, type MessagePortLike } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'
import type { MethodMap } from '@/types/MethodMap'
import { type HeartbeatOption, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import { createInitRequest, type InitRequest, isInitResponse } from '@/lib/adapter/message-port/utils/handshake'

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
        heartbeat: HeartbeatOption = false,
    ) {
        super(resolveHeartbeatOptions(heartbeat))
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

    protected acceptInitResponse(event: { data: unknown; ports: readonly MessagePortLike[] }): void {
        this.acceptInitResponseData(event.data, event.ports)
    }

    protected acceptInitResponseData(data: unknown, ports: readonly MessagePortLike[]): void {
        if (this.isExpectedInitResponse(data)) {
            this.completeHandshake(ports)
        }
    }

    protected isExpectedInitResponse(data: unknown): boolean {
        return this.handshake !== undefined && isInitResponse(data, this.handshake.request.id)
    }

    protected override onRemoteGoodbye(): void {
        super.onRemoteGoodbye()
        this.connect()
    }

    private completeHandshake([data, control]: readonly MessagePortLike[]): void {
        if (!data || !control) {
            this.logger?.warn('Ignored a handshake response without the expected message ports')
            return
        }
        this.stopHandshake()
        this.attachPorts({ data, control })
    }

    protected stopHandshake(): void {
        this.handshake?.listeners.abort()
        clearInterval(this.handshake?.pollingIntervalId)
        this.handshake = undefined
    }

    override destroy(): void {
        this.stopHandshake()
        super.destroy()
    }
}
