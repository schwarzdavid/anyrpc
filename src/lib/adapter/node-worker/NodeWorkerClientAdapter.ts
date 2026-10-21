import { MessagePort, parentPort } from 'node:worker_threads'
import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortHostAdapter } from '@/lib/adapter/message-port/AbstractMessagePortHostAdapter'
import type { MessagePortLike } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'
import type { InitResponse } from '@/lib/adapter/message-port/utils/handshake'
import { readMessageData } from '@/lib/adapter/message-port/utils/messageData'
import { DEFAULT_NODE_WORKER_ADAPTER_NAME, NODE_WORKER_INIT_METHOD_NAME } from './constants/nodeWorkerHandshake'
import { createInitEnvelope } from './utils/initEnvelope'

function requireParentPort(): MessagePort {
    if (!parentPort) {
        throw new Error(
            'NodeWorkerClientAdapter must be created inside a worker thread. ' +
                'Use NodeWorkerHostAdapter in the thread that starts the worker.',
        )
    }
    return parentPort
}

export class NodeWorkerClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortHostAdapter<Methods, Events> {
    private readonly parentPort: MessagePort

    constructor(name: string = DEFAULT_NODE_WORKER_ADAPTER_NAME) {
        const port = requireParentPort()
        super(NODE_WORKER_INIT_METHOD_NAME, name, false)
        this.parentPort = port
    }

    protected listenForInitRequests(signal: AbortSignal): void {
        this.parentPort.addEventListener('message', (event) => this.acceptInitRequest(readMessageData(event)), {
            signal,
        })
    }

    protected postInitResponse(response: InitResponse, transfer: MessagePortLike[]): void {
        const ports = transfer.filter((port) => port instanceof MessagePort)
        this.parentPort.postMessage(createInitEnvelope(response, ports), ports)
    }

    protected override onRepeatedInitRequest(): void {
        this.logger?.debug('Ignored a repeated handshake request that was already answered')
    }
}
