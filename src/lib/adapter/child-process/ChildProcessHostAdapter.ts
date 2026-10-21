import type { MethodMap } from '@/types/MethodMap'
import { AbstractSocketAdapter } from '@/lib/adapter/socket/AbstractSocketAdapter'
import { type HeartbeatOption, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import { createInitRequest, type InitRequest, isInitResponse } from '@/lib/adapter/message-port/utils/handshake'
import { CHILD_PROCESS_INIT_METHOD_NAME, DEFAULT_CHILD_PROCESS_ADAPTER_NAME } from './constants/childProcessHandshake'
import { createIpcEnvelope, readIpcEnvelope } from './utils/ipcEnvelope'

export interface ChildProcessHostAdapterOptions {
    pollingInterval: number
    heartbeat: HeartbeatOption
    killOnDestroy: boolean
}

export interface ChildProcessLike {
    readonly connected: boolean
    send(message: unknown, callback: (error: Error | null) => void): boolean
    on(event: 'message', listener: (message: unknown) => void): unknown
    on(event: 'exit', listener: (code: number | null) => void): unknown
    on(event: 'disconnect', listener: () => void): unknown
    off(event: 'message', listener: (message: unknown) => void): unknown
    off(event: 'exit', listener: (code: number | null) => void): unknown
    off(event: 'disconnect', listener: () => void): unknown
    kill(): boolean
}

interface Handshake {
    request: InitRequest
    pollingIntervalId: ReturnType<typeof setInterval>
}

export class ChildProcessHostAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractSocketAdapter<Methods, Events> {
    private readonly pollingInterval: number
    private readonly killOnDestroy: boolean
    private handshake: Handshake | undefined
    private readonly onChildMessage = (message: unknown) => this.handleChildMessage(message)
    private readonly onChildExit = (code: number | null) => this.handleChildExit(code)
    private readonly onChildDisconnect = () => this.handleChildDisconnect()
    private readonly onSendResult = (error: Error | null) => this.handleSendResult(error)

    constructor(
        private readonly child: ChildProcessLike,
        private readonly name: string = DEFAULT_CHILD_PROCESS_ADAPTER_NAME,
        options?: Partial<ChildProcessHostAdapterOptions>,
    ) {
        super(resolveHeartbeatOptions(options?.heartbeat ?? false))
        this.pollingInterval = options?.pollingInterval ?? 1000
        this.killOnDestroy = options?.killOnDestroy ?? false
    }

    connect(): void {
        this.stopListening()
        if (!this.child.connected) {
            this.handleChildDisconnect()
            return
        }
        this.child.on('message', this.onChildMessage)
        this.child.on('exit', this.onChildExit)
        this.child.on('disconnect', this.onChildDisconnect)
        this.startHandshake()
    }

    protected send(message: object): void {
        if (this.child.connected) {
            this.child.send(createIpcEnvelope(this.name, message), this.onSendResult)
        }
    }

    protected override onRemoteGoodbye(): void {
        super.onRemoteGoodbye()
        this.startHandshake()
    }

    override destroy(): void {
        this.stopHandshake()
        super.destroy()
        this.stopListening()
        if (this.killOnDestroy) {
            this.child.kill()
        }
    }

    private startHandshake(): void {
        this.stopHandshake()
        const request = createInitRequest(CHILD_PROCESS_INIT_METHOD_NAME, this.name)

        this.handshake = {
            request,
            pollingIntervalId: setInterval(() => this.send(request), this.pollingInterval),
        }
        this.send(request)
    }

    private stopHandshake(): void {
        clearInterval(this.handshake?.pollingIntervalId)
        this.handshake = undefined
    }

    private handleChildMessage(value: unknown): void {
        const message = readIpcEnvelope(value, this.name)

        if (!message) {
            return
        }
        if (this.handshake && isInitResponse(message, this.handshake.request.id)) {
            this.stopHandshake()
            this.opened()
            return
        }
        this.receive(message)
    }

    private handleChildExit(code: number | null): void {
        this.logger?.info(`The child process exited with code ${String(code)}, so the channel will not reconnect`)
        this.destroy()
    }

    private handleChildDisconnect(): void {
        this.logger?.info('The IPC channel to the child process is closed, so the channel will not reconnect')
        this.destroy()
    }

    private handleSendResult(error: Error | null): void {
        if (error) {
            this.logger?.debug('Could not send a message to the child process', error)
        }
    }

    private stopListening(): void {
        this.child.off('message', this.onChildMessage)
        this.child.off('exit', this.onChildExit)
        this.child.off('disconnect', this.onChildDisconnect)
    }
}
