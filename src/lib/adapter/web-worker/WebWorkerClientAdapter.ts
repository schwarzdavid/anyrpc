import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortClientAdapter } from '@/lib/adapter/message-port/AbstractMessagePortClientAdapter'
import type { InitRequest } from '@/lib/adapter/message-port/utils/handshake'
import { DEFAULT_WEB_WORKER_ADAPTER_NAME, WEB_WORKER_INIT_METHOD_NAME } from './constants/webWorkerHandshake'
import { GlobalScope, isRunningIn, isRunningInWindow } from './utils/globalScope'

export interface WebWorkerClientAdapterOptions {
    pollingInterval: number
}

function assertDedicatedWorkerScope(): void {
    if (isRunningInWindow()) {
        throw new Error(
            'WebWorkerClientAdapter must be created inside the web worker. ' +
                'Use WebWorkerHostAdapter on the page that starts the worker.',
        )
    }
    if (isRunningIn(GlobalScope.SHARED_WORKER)) {
        throw new Error(
            'WebWorkerClientAdapter only works in dedicated workers. ' +
                'In a shared worker, use SharedWorkerHubAdapter with createRpcHub.',
        )
    }
    if (isRunningIn(GlobalScope.SERVICE_WORKER)) {
        throw new Error('WebWorkerClientAdapter only works in dedicated workers, not in service workers.')
    }
}

export class WebWorkerClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortClientAdapter<Methods, Events> {
    constructor(name: string = DEFAULT_WEB_WORKER_ADAPTER_NAME, options?: Partial<WebWorkerClientAdapterOptions>) {
        assertDedicatedWorkerScope()
        super(WEB_WORKER_INIT_METHOD_NAME, name, options?.pollingInterval ?? 1000)
    }

    protected listenForInitResponses(signal: AbortSignal): void {
        globalThis.addEventListener('message', (event) => this.acceptInitResponse(event), { signal })
    }

    protected postInitRequest(request: InitRequest): void {
        globalThis.postMessage(request)
    }
}
