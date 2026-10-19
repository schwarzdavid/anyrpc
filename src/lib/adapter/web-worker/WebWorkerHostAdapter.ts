import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortClientAdapter } from '@/lib/adapter/message-port/AbstractMessagePortClientAdapter'
import type { HeartbeatOption } from '@/lib/Heartbeat'
import type { InitRequest } from '@/lib/adapter/message-port/utils/handshake'
import { DEFAULT_WEB_WORKER_ADAPTER_NAME, WEB_WORKER_INIT_METHOD_NAME } from './constants/webWorkerHandshake'
import { describeWorkerError, isWorkerStartFailure } from './utils/describeWorkerError'

export interface SharedWorkerHostAdapterOptions {
    pollingInterval: number
    heartbeat: HeartbeatOption
}

export interface WebWorkerHostAdapterOptions extends SharedWorkerHostAdapterOptions {
    terminateOnDestroy: boolean
}

export interface WebWorkerLike extends Pick<Worker, 'addEventListener' | 'terminate'> {
    postMessage(message: unknown): void
}

export interface SharedWorkerLike {
    readonly port: MessagePort
    addEventListener(type: 'error', listener: (event: Event) => void, options?: AddEventListenerOptions): void
}

function isSharedWorker(worker: WebWorkerLike | SharedWorkerLike): worker is SharedWorkerLike {
    return 'port' in worker
}

export class WebWorkerHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortClientAdapter<Methods, Events> {
    private readonly terminateOnDestroy: boolean
    private readonly workerKind: string
    private errorListenersAbortController: AbortController | undefined

    constructor(worker: WebWorkerLike, name?: string, options?: Partial<WebWorkerHostAdapterOptions>)
    constructor(worker: SharedWorkerLike, name?: string, options?: Partial<SharedWorkerHostAdapterOptions>)
    constructor(
        private readonly worker: WebWorkerLike | SharedWorkerLike,
        name: string = DEFAULT_WEB_WORKER_ADAPTER_NAME,
        options?: Partial<WebWorkerHostAdapterOptions>,
    ) {
        super(WEB_WORKER_INIT_METHOD_NAME, name, options?.pollingInterval ?? 1000, options?.heartbeat ?? false)
        this.terminateOnDestroy = options?.terminateOnDestroy ?? false
        this.workerKind = isSharedWorker(worker) ? 'shared worker' : 'web worker'
    }

    override connect(): void {
        this.listenForWorkerErrors()
        super.connect()
    }

    protected listenForInitResponses(signal: AbortSignal): void {
        const onMessage = (event: MessageEvent) => this.acceptInitResponse(event)

        if (isSharedWorker(this.worker)) {
            this.worker.port.addEventListener('message', onMessage, { signal })
            this.worker.port.start()
            return
        }
        this.worker.addEventListener('message', onMessage, { signal })
    }

    protected postInitRequest(request: InitRequest): void {
        if (isSharedWorker(this.worker)) {
            this.worker.port.postMessage(request)
            return
        }
        this.worker.postMessage(request)
    }

    private listenForWorkerErrors(): void {
        this.errorListenersAbortController?.abort()
        this.errorListenersAbortController = new AbortController()

        this.worker.addEventListener('error', (event: Event) => this.handleWorkerError(event), {
            signal: this.errorListenersAbortController.signal,
        })
    }

    private handleWorkerError(event: Event): void {
        this.logger?.error(describeWorkerError(event, this.workerKind))
        if (isWorkerStartFailure(event)) {
            this.stopHandshake()
        }
    }

    override destroy(): void {
        this.errorListenersAbortController?.abort()
        super.destroy()
        if (this.terminateOnDestroy && !isSharedWorker(this.worker)) {
            this.worker.terminate()
        }
    }
}
