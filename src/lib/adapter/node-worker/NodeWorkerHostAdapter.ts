import type { MethodMap } from '@/types/MethodMap'
import { AbstractMessagePortClientAdapter } from '@/lib/adapter/message-port/AbstractMessagePortClientAdapter'
import type { HeartbeatOption } from '@/lib/Heartbeat'
import type { InitRequest } from '@/lib/adapter/message-port/utils/handshake'
import { DEFAULT_NODE_WORKER_ADAPTER_NAME, NODE_WORKER_INIT_METHOD_NAME } from './constants/nodeWorkerHandshake'
import { readInitEnvelope } from './utils/initEnvelope'

export interface NodeWorkerHostAdapterOptions {
    pollingInterval: number
    heartbeat: HeartbeatOption
    terminateOnDestroy: boolean
}

export interface NodeWorkerLike {
    postMessage(message: unknown): void
    on(event: 'message', listener: (message: unknown) => void): unknown
    on(event: 'error', listener: (error: Error) => void): unknown
    on(event: 'exit', listener: (exitCode: number) => void): unknown
    off(event: 'message', listener: (message: unknown) => void): unknown
    off(event: 'error', listener: (error: Error) => void): unknown
    off(event: 'exit', listener: (exitCode: number) => void): unknown
    terminate(): unknown
}

export class NodeWorkerHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortClientAdapter<Methods, Events> {
    private readonly terminateOnDestroy: boolean
    private readonly onWorkerError = (error: Error) => this.logger?.error('Uncaught error in node worker', error)
    private readonly onWorkerExit = (exitCode: number) => this.handleWorkerExit(exitCode)

    constructor(
        private readonly worker: NodeWorkerLike,
        name: string = DEFAULT_NODE_WORKER_ADAPTER_NAME,
        options?: Partial<NodeWorkerHostAdapterOptions>,
    ) {
        super(NODE_WORKER_INIT_METHOD_NAME, name, options?.pollingInterval ?? 1000, options?.heartbeat ?? false)
        this.terminateOnDestroy = options?.terminateOnDestroy ?? false
    }

    override connect(): void {
        this.listenForWorkerLifecycle()
        super.connect()
    }

    protected listenForInitResponses(signal: AbortSignal): void {
        const onMessage = (message: unknown) => this.acceptInitEnvelope(message)

        this.worker.on('message', onMessage)
        signal.addEventListener('abort', () => this.worker.off('message', onMessage), { once: true })
    }

    protected postInitRequest(request: InitRequest): void {
        this.worker.postMessage(request)
    }

    private acceptInitEnvelope(message: unknown): void {
        const envelope = readInitEnvelope(message)

        if (envelope) {
            this.acceptInitResponseData(envelope.response, envelope.ports)
        }
    }

    private listenForWorkerLifecycle(): void {
        this.stopListeningForWorkerLifecycle()
        this.worker.on('error', this.onWorkerError)
        this.worker.on('exit', this.onWorkerExit)
    }

    private stopListeningForWorkerLifecycle(): void {
        this.worker.off('error', this.onWorkerError)
        this.worker.off('exit', this.onWorkerExit)
    }

    private handleWorkerExit(exitCode: number): void {
        this.logger?.info(`The node worker exited with code ${String(exitCode)}, so the channel will not reconnect`)
        this.destroy()
    }

    override destroy(): void {
        this.stopListeningForWorkerLifecycle()
        super.destroy()
        if (this.terminateOnDestroy) {
            this.worker.terminate()
        }
    }
}
