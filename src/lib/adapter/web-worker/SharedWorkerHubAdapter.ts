import type { MethodMap } from '@/types/MethodMap'
import type { RpcId } from '@/types/RpcMessages'
import { AbstractRpcHubAdapter } from '@/lib/adapter/AbstractRpcHubAdapter'
import { type HeartbeatOption, type HeartbeatOptions, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import { createInitResponse, isInitRequest } from '@/lib/adapter/message-port/utils/handshake'
import { DEFAULT_SHARED_WORKER_ADAPTER_NAME, SHARED_WORKER_INIT_METHOD_NAME } from './constants/sharedWorkerHandshake'
import { GlobalScope, isRunningIn } from './utils/globalScope'
import { SharedWorkerPeerAdapter } from './SharedWorkerPeerAdapter'

export interface SharedWorkerHubAdapterOptions {
    heartbeat: HeartbeatOption
}

function assertSharedWorkerScope(): void {
    if (!isRunningIn(GlobalScope.SHARED_WORKER)) {
        throw new Error(
            'SharedWorkerHubAdapter must be created inside the shared worker. ' +
                'Use SharedWorkerHostAdapter on the pages that connect to the worker.',
        )
    }
}

export class SharedWorkerHubAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractRpcHubAdapter<Methods, Events> {
    private readonly heartbeatOptions: HeartbeatOptions | undefined
    private listenersAbortController: AbortController | undefined

    constructor(
        private readonly name: string = DEFAULT_SHARED_WORKER_ADAPTER_NAME,
        options?: Partial<SharedWorkerHubAdapterOptions>,
    ) {
        assertSharedWorkerScope()
        super()
        this.heartbeatOptions = resolveHeartbeatOptions(options?.heartbeat ?? true)
    }

    connect(): void {
        this.stopListening()
        this.listenersAbortController = new AbortController()
        const { signal } = this.listenersAbortController

        globalThis.addEventListener(
            'connect',
            (event) => this.acceptConnection((event as MessageEvent).ports, signal),
            { signal },
        )
    }

    destroy(): void {
        this.stopListening()
    }

    private acceptConnection([port]: readonly MessagePort[], signal: AbortSignal): void {
        if (!port) {
            this.logger?.warn('Ignored a connection without a message port')
            return
        }
        const answeredInitIds = new Set<RpcId>()

        port.addEventListener('message', (event) => this.acceptInitRequest(port, event.data, answeredInitIds), {
            signal,
        })
        port.start()
    }

    private acceptInitRequest(port: MessagePort, data: unknown, answeredInitIds: Set<RpcId>): void {
        if (!isInitRequest(data, SHARED_WORKER_INIT_METHOD_NAME, this.name) || answeredInitIds.has(data.id)) {
            return
        }
        answeredInitIds.add(data.id)

        const dataChannel = new MessageChannel()
        const controlChannel = new MessageChannel()
        const peer = new SharedWorkerPeerAdapter<Methods, Events>(
            { data: dataChannel.port1, control: controlChannel.port1 },
            this.heartbeatOptions,
        )
        const id = this.addPeer(peer)

        peer.closedHandler = () => this.removePeer(id)
        port.postMessage(createInitResponse(data), [dataChannel.port2, controlChannel.port2])
    }

    private stopListening(): void {
        this.listenersAbortController?.abort()
        this.listenersAbortController = undefined
    }
}
