import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortHostAdapter } from '@/lib/adapter/message-port/AbstractMessagePortHostAdapter'
import type { HeartbeatOption } from '@/lib/Heartbeat'
import type { InitResponse } from '@/utils/message-port/handshake'
import { DEFAULT_WEB_WORKER_ADAPTER_NAME, WEB_WORKER_INIT_METHOD_NAME } from '../webWorkerHandshake'

export interface WebWorkerHostAdapterOptions {
    terminateOnDestroy: boolean
    heartbeat: HeartbeatOption
}

export interface WebWorkerLike extends Pick<Worker, 'addEventListener' | 'terminate'> {
    postMessage(message: unknown, transfer: Transferable[]): void
}

export class WebWorkerHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortHostAdapter<Methods, Events> {
    private readonly terminateOnDestroy: boolean

    constructor(
        private readonly worker: WebWorkerLike,
        name: string = DEFAULT_WEB_WORKER_ADAPTER_NAME,
        options?: Partial<WebWorkerHostAdapterOptions>,
    ) {
        super(WEB_WORKER_INIT_METHOD_NAME, name, options?.heartbeat ?? false)
        this.terminateOnDestroy = options?.terminateOnDestroy ?? false
    }

    protected listenForInitRequests(signal: AbortSignal): void {
        this.worker.addEventListener('message', (event) => this.acceptInitRequest(event.data), { signal })
        this.worker.addEventListener('error', (event) => this.logWorkerError(event), { signal })
    }

    protected postInitResponse(response: InitResponse, transfer: Transferable[]): void {
        this.worker.postMessage(response, transfer)
    }

    private logWorkerError(event: Event): void {
        if (event instanceof ErrorEvent) {
            this.logger?.error(
                `Uncaught error in web worker: ${event.message} (${[event.filename, event.lineno, event.colno].join(':')})`,
            )
            return
        }
        this.logger?.error(
            'The web worker could not be started, so the channel will never connect. ' +
                'Check that the script URL is correct and served with a JavaScript MIME type.',
        )
    }

    override destroy(): void {
        super.destroy()
        if (this.terminateOnDestroy) {
            this.worker.terminate()
        }
    }
}
