import { AbstractMessagePortAdapter, type MessagePortLike } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'
import type { MethodMap } from '@/types/MethodMap'
import type { RpcId } from '@/types/RpcMessages'
import { type HeartbeatOption, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import {
    createInitResponse,
    type InitRequest,
    type InitResponse,
    isInitRequest,
} from '@/lib/adapter/message-port/utils/handshake'

export interface MessagePortResponderOptions {
    initMethod: string
    name: string
    heartbeat?: HeartbeatOption | undefined
}

export abstract class AbstractMessagePortResponderAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortAdapter<Methods, Events> {
    private readonly initMethod: string
    private readonly name: string
    private answeredInitId: RpcId | undefined
    private listenersAbortController: AbortController | undefined

    protected constructor(options: MessagePortResponderOptions) {
        super(resolveHeartbeatOptions(options.heartbeat ?? false))
        this.initMethod = options.initMethod
        this.name = options.name
    }

    connect(): void {
        this.stopListening()
        this.listenersAbortController = new AbortController()
        this.listenForInitRequests(this.listenersAbortController.signal)
    }

    protected abstract listenForInitRequests(signal: AbortSignal): void

    protected abstract postInitResponse(response: InitResponse, transfer: MessagePortLike[]): void

    protected acceptInitRequest(data: unknown): boolean {
        if (!this.isExpectedInitRequest(data)) {
            return false
        }
        if (data.id === this.answeredInitId) {
            this.onRepeatedInitRequest()
            return false
        }
        this.answeredInitId = data.id

        const dataChannel = new MessageChannel()
        const controlChannel = new MessageChannel()

        this.attachPorts({ data: dataChannel.port1, control: controlChannel.port1 }, { awaitRemote: true })
        this.postInitResponse(createInitResponse(data), [dataChannel.port2, controlChannel.port2])
        return true
    }

    protected onRepeatedInitRequest(): void {
        this.logger?.warn(
            'Ignored a repeated handshake request that was already answered. ' +
                'If the connection never gets established, check the origin options on both sides.',
        )
    }

    protected isExpectedInitRequest(data: unknown): data is InitRequest {
        return isInitRequest(data, this.initMethod, this.name)
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
