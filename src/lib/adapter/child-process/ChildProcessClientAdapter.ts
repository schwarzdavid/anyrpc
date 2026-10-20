import type { MethodMap } from '@/types/MethodMap'
import type { RpcId } from '@/types/RpcMessages'
import { AbstractSocketAdapter } from '@/lib/adapter/socket/AbstractSocketAdapter'
import { createInitResponse, type InitRequest, isInitRequest } from '@/lib/adapter/message-port/utils/handshake'
import { CHILD_PROCESS_INIT_METHOD_NAME, DEFAULT_CHILD_PROCESS_ADAPTER_NAME } from './constants/childProcessHandshake'
import { createIpcEnvelope, readIpcEnvelope } from './utils/ipcEnvelope'
import { currentProcess, hasIpcChannel, type IpcProcess } from './utils/currentProcess'

function requireIpcProcess(): IpcProcess {
    const candidate = currentProcess()

    if (!hasIpcChannel(candidate)) {
        throw new Error(
            'ChildProcessClientAdapter must be created in a process with an IPC channel, ' +
                'e.g. one started with child_process.fork(). Use ChildProcessHostAdapter in the parent process.',
        )
    }
    return candidate
}

export class ChildProcessClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractSocketAdapter<Methods, Events> {
    private readonly ipc: IpcProcess
    private answeredInitId: RpcId | undefined
    private readonly onParentMessage = (message: unknown) => this.handleParentMessage(message)
    private readonly onDisconnect = () => this.closed()

    constructor(private readonly name: string = DEFAULT_CHILD_PROCESS_ADAPTER_NAME) {
        super()
        this.ipc = requireIpcProcess()
    }

    connect(): void {
        this.stopListening()
        this.ipc.on('message', this.onParentMessage)
        this.ipc.on('disconnect', this.onDisconnect)
    }

    protected send(message: object): void {
        if (this.ipc.connected) {
            this.ipc.send(createIpcEnvelope(this.name, message))
        }
    }

    override destroy(): void {
        super.destroy()
        this.stopListening()
    }

    private handleParentMessage(value: unknown): void {
        const message = readIpcEnvelope(value, this.name)

        if (!message) {
            return
        }
        if (isInitRequest(message, CHILD_PROCESS_INIT_METHOD_NAME, this.name)) {
            this.acceptInitRequest(message)
            return
        }
        this.receive(message)
    }

    private acceptInitRequest(request: InitRequest): void {
        if (request.id === this.answeredInitId) {
            this.logger?.debug('Ignored a repeated handshake request that was already answered')
            return
        }
        if (this.answeredInitId !== undefined) {
            this.closed()
        }
        this.answeredInitId = request.id
        this.send(createInitResponse(request))
        this.opened()
    }

    private stopListening(): void {
        this.ipc.off('message', this.onParentMessage)
        this.ipc.off('disconnect', this.onDisconnect)
    }
}
