import { AbstractMessagePortAdapter } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'
import type { MethodMap } from '@/types/MethodMap'
import type { RpcId } from '@/types/RpcMessages'
import { type HeartbeatOption, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import { createInitResponse, type InitRequest, type InitResponse, isInitRequest } from '@/utils/message-port/handshake'

export abstract class AbstractMessagePortHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortAdapter<Methods, Events> {
    private answeredInitId: RpcId | undefined
    private listenersAbortController: AbortController | undefined

    protected constructor(
        private readonly initMethodName: string,
        private readonly channelName: string,
        heartbeat: HeartbeatOption,
    ) {
        super(resolveHeartbeatOptions(heartbeat))
    }

    connect(): void {
        this.stopListening()
        this.listenersAbortController = new AbortController()
        this.listenForInitRequests(this.listenersAbortController.signal)
    }

    protected abstract listenForInitRequests(signal: AbortSignal): void

    protected abstract postInitResponse(response: InitResponse, transfer: Transferable[]): void

    protected acceptInitRequest(data: unknown): boolean {
        if (!this.isExpectedInitRequest(data)) {
            return false
        }
        if (data.id === this.answeredInitId) {
            this.logger?.warn(
                'Ignored a repeated handshake request that was already answered. ' +
                    'If the connection never gets established, check the origin options on both sides.',
            )
            return false
        }
        this.answeredInitId = data.id

        const dataChannel = new MessageChannel()
        const controlChannel = new MessageChannel()

        this.attachPorts({ data: dataChannel.port1, control: controlChannel.port1 }, { awaitRemote: true })
        this.postInitResponse(createInitResponse(data), [dataChannel.port2, controlChannel.port2])
        return true
    }

    protected isExpectedInitRequest(data: unknown): data is InitRequest {
        return isInitRequest(data, this.initMethodName, this.channelName)
    }

    protected stopListening(): void {
        this.listenersAbortController?.abort()
        this.listenersAbortController = undefined
    }

    override destroy(): void {
        this.stopListening()
        super.destroy()
    }
}
