import { AbstractMessagePortAdapter } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'
import type { MethodMap } from '@/types/MethodMap'
import type { RpcId } from '@/types/RpcMessages'
import { createInitRequest, type InitRequest, isInitResponse } from '@/utils/message-port/handshake'
import { ControlMethod, createControlMessage } from '@/utils/message-port/controlMessages'

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
    private lastRequestId: RpcId | undefined

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

        this.lastRequestId = request.id
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
        if (this.isExpectedInitResponse(event.data)) {
            this.completeHandshake(event.ports)
            return
        }
        if (this.lastRequestId !== undefined && isInitResponse(event.data, this.lastRequestId)) {
            this.declineInitResponse(event.ports)
        }
    }

    protected isExpectedInitResponse(data: unknown): boolean {
        return this.handshake !== undefined && isInitResponse(data, this.handshake.request.id)
    }

    protected override onRemoteGoodbye(): void {
        super.onRemoteGoodbye()
        this.connect()
    }

    private completeHandshake(ports: readonly MessagePort[]): void {
        const [data, control] = ports
        if (!data || !control) {
            this.logger?.warn('Ignored a handshake response without the expected message ports')
            return
        }
        this.stopHandshake()
        this.attachPorts({ data, control })
    }

    private declineInitResponse(ports: readonly MessagePort[]): void {
        this.logger?.warn(
            'Declined a handshake response because the handshake is already finished. ' +
                'Is another host adapter using the same name?',
        )
        const [, control] = ports
        control?.postMessage(createControlMessage(ControlMethod.GOODBYE))
        ports.forEach((port) => port.close())
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
