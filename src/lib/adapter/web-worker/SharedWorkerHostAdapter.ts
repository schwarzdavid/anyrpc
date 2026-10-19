import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortClientAdapter } from '@/lib/adapter/message-port/AbstractMessagePortClientAdapter'
import type { InitRequest } from '@/lib/adapter/message-port/utils/handshake'
import { DEFAULT_SHARED_WORKER_ADAPTER_NAME, SHARED_WORKER_INIT_METHOD_NAME } from './constants/sharedWorkerHandshake'
import { describeWorkerError } from './utils/describeWorkerError'

export interface SharedWorkerHostAdapterOptions {
    pollingInterval: number
}

export interface SharedWorkerLike {
    readonly port: MessagePort
    addEventListener(type: 'error', listener: (event: Event) => void, options?: AddEventListenerOptions): void
}

export class SharedWorkerHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortClientAdapter<Methods, Events> {
    constructor(
        private readonly worker: SharedWorkerLike,
        name: string = DEFAULT_SHARED_WORKER_ADAPTER_NAME,
        options?: Partial<SharedWorkerHostAdapterOptions>,
    ) {
        super(SHARED_WORKER_INIT_METHOD_NAME, name, options?.pollingInterval ?? 1000)
    }

    protected listenForInitResponses(signal: AbortSignal): void {
        this.worker.port.addEventListener('message', (event) => this.acceptInitResponse(event), { signal })
        this.worker.port.start()
        this.worker.addEventListener(
            'error',
            (event) => this.logger?.error(describeWorkerError(event, 'shared worker')),
            { signal },
        )
    }

    protected postInitRequest(request: InitRequest): void {
        this.worker.port.postMessage(request)
    }
}
