import { AbstractMessagePortAdapter } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'
import type { MethodMap } from '@/types/MethodMap'
import type { RpcId } from '@/types/RpcMessages'
import { type HeartbeatOption, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import { createInitResponse, type InitResponse, isInitRequest } from '@/utils/message-port/handshake'

export abstract class AbstractMessagePortHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortAdapter<Methods, Events> {
    private answeredInitId: RpcId | undefined
    private listeners: AbortController | undefined

    protected constructor(
        private readonly initMethod: string,
        private readonly name: string,
        heartbeat: HeartbeatOption,
    ) {
        super(resolveHeartbeatOptions(heartbeat))
    }

    connect(): void {
        this.stopListening()
        this.listeners = new AbortController()
        this.listenForInitRequests(this.listeners.signal)
    }

    protected abstract listenForInitRequests(signal: AbortSignal): void

    protected abstract postInitResponse(response: InitResponse, transfer: Transferable[]): void

    protected acceptInitRequest(data: unknown): boolean {
        if (!isInitRequest(data, this.initMethod, this.name) || data.id === this.answeredInitId) {
            return false
        }
        this.answeredInitId = data.id

        const dataChannel = new MessageChannel()
        const controlChannel = new MessageChannel()

        this.attachPorts({ data: dataChannel.port1, control: controlChannel.port1 })
        this.postInitResponse(createInitResponse(data), [dataChannel.port2, controlChannel.port2])
        return true
    }

    protected stopListening(): void {
        this.listeners?.abort()
        this.listeners = undefined
    }

    override destroy(): void {
        this.stopListening()
        super.destroy()
    }
}
