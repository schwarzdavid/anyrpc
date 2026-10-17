import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortClientAdapter } from '@/lib/adapter/message-port/AbstractMessagePortClientAdapter'
import type { InitRequest } from '@/utils/message-port/handshake'
import { DEFAULT_WEB_WORKER_ADAPTER_NAME, WEB_WORKER_INIT_METHOD_NAME } from '../webWorkerHandshake'

export interface WebWorkerClientAdapterOptions {
    pollingInterval: number
}

export class WebWorkerClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortClientAdapter<Methods, Events> {
    constructor(name: string = DEFAULT_WEB_WORKER_ADAPTER_NAME, options?: Partial<WebWorkerClientAdapterOptions>) {
        super(WEB_WORKER_INIT_METHOD_NAME, name, options?.pollingInterval ?? 1000)
    }

    protected listenForInitResponses(signal: AbortSignal): void {
        globalThis.addEventListener('message', (event) => this.acceptInitResponse(event), { signal })
    }

    protected postInitRequest(request: InitRequest): void {
        globalThis.postMessage(request)
    }
}
