import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortClientAdapter } from '@/lib/adapter/message-port/AbstractMessagePortClientAdapter'
import type { InitRequest } from '@/lib/adapter/message-port/utils/handshake'
import { DEFAULT_WEB_WORKER_ADAPTER_NAME, WEB_WORKER_INIT_METHOD_NAME } from './constants/webWorkerHandshake'

export interface WebWorkerClientAdapterOptions {
    pollingInterval: number
}

function isRunningInWindow(): boolean {
    return Reflect.get(globalThis, 'window') === globalThis
}

export class WebWorkerClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortClientAdapter<Methods, Events> {
    constructor(name: string = DEFAULT_WEB_WORKER_ADAPTER_NAME, options?: Partial<WebWorkerClientAdapterOptions>) {
        if (isRunningInWindow()) {
            throw new Error(
                'WebWorkerClientAdapter must be created inside the web worker. ' +
                    'Use WebWorkerHostAdapter on the page that starts the worker.',
            )
        }
        super(WEB_WORKER_INIT_METHOD_NAME, name, options?.pollingInterval ?? 1000)
    }

    protected listenForInitResponses(signal: AbortSignal): void {
        globalThis.addEventListener('message', (event) => this.acceptInitResponse(event), { signal })
    }

    protected postInitRequest(request: InitRequest): void {
        globalThis.postMessage(request)
    }
}
