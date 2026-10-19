import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortHostAdapter } from '@/lib/adapter/message-port/AbstractMessagePortHostAdapter'
import type { InitResponse } from '@/lib/adapter/message-port/utils/handshake'
import { DEFAULT_WEB_WORKER_ADAPTER_NAME, WEB_WORKER_INIT_METHOD_NAME } from './constants/webWorkerHandshake'
import { GlobalScope, isRunningIn, isRunningInWindow } from './utils/globalScope'

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
> extends AbstractMessagePortHostAdapter<Methods, Events> {
    constructor(name: string = DEFAULT_WEB_WORKER_ADAPTER_NAME) {
        assertDedicatedWorkerScope()
        super(WEB_WORKER_INIT_METHOD_NAME, name, false)
    }

    protected listenForInitRequests(signal: AbortSignal): void {
        globalThis.addEventListener('message', (event) => this.acceptInitRequest(event.data), { signal })
    }

    protected postInitResponse(response: InitResponse, transfer: Transferable[]): void {
        globalThis.postMessage(response, { transfer })
    }

    protected override onRepeatedInitRequest(): void {
        this.logger?.debug('Ignored a repeated handshake request that was already answered')
    }
}
