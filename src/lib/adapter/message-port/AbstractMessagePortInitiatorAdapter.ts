import {
    AbstractMessagePortAdapter,
    type MessageEventLike,
    type MessagePortLike,
} from '@/lib/adapter/message-port/AbstractMessagePortAdapter'
import type { MethodMap } from '@/types/MethodMap'
import { type HeartbeatOption, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import { createInitRequest, type InitRequest, isInitResponse } from '@/lib/adapter/message-port/utils/handshake'

export interface MessagePortInitiatorOptions {
    initMethod: string
    name: string
    pollingInterval?: number | undefined
    heartbeat?: HeartbeatOption | undefined
}

interface Handshake {
    request: InitRequest
    listeners: AbortController
    pollingIntervalId: ReturnType<typeof setInterval>
}

const DEFAULT_POLLING_INTERVAL = 1000

export abstract class AbstractMessagePortInitiatorAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortAdapter<Methods, Events> {
    private readonly initMethod: string
    private readonly name: string
    private readonly pollingInterval: number
    private handshake: Handshake | undefined

    protected constructor(options: MessagePortInitiatorOptions) {
        super(resolveHeartbeatOptions(options.heartbeat ?? false))
        this.initMethod = options.initMethod
        this.name = options.name
        this.pollingInterval = options.pollingInterval ?? DEFAULT_POLLING_INTERVAL
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

    protected acceptInitResponse(event: MessageEventLike): void {
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
