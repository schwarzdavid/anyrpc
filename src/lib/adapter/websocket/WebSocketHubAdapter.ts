import type { MethodMap } from '@/types/MethodMap'
import { AbstractRpcHubAdapter } from '@/lib/adapter/AbstractRpcHubAdapter'
import { type HeartbeatOption, type HeartbeatOptions, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import { type WebSocketLike, WebSocketPeerAdapter } from './WebSocketPeerAdapter'

export interface WebSocketRequestLike {
    readonly headers: Readonly<Record<string, string | string[] | undefined>>
    readonly url?: string | undefined
}

export interface WebSocketPeerContext<Request = WebSocketRequestLike> {
    readonly request: Request
}

export interface WebSocketServerLike<Request = WebSocketRequestLike> {
    on(event: 'connection', listener: (socket: WebSocketLike, request: Request) => void): unknown
    off(event: 'connection', listener: (socket: WebSocketLike, request: Request) => void): unknown
}

export interface WebSocketHubAdapterOptions {
    heartbeat: HeartbeatOption
}

export class WebSocketHubAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Request = WebSocketRequestLike,
> extends AbstractRpcHubAdapter<Methods, Events, WebSocketPeerContext<Request>> {
    protected override readonly logName = 'WebSocketHubAdapter'
    private readonly heartbeatOptions: HeartbeatOptions | undefined
    private readonly onConnection = (socket: WebSocketLike, request: Request) => this.acceptSocket(socket, request)

    constructor(
        private readonly server: WebSocketServerLike<Request>,
        options?: Partial<WebSocketHubAdapterOptions>,
    ) {
        super()
        this.heartbeatOptions = resolveHeartbeatOptions(options?.heartbeat ?? true)
    }

    connect(): void {
        this.server.off('connection', this.onConnection)
        this.server.on('connection', this.onConnection)
    }

    destroy(): void {
        this.server.off('connection', this.onConnection)
    }

    private acceptSocket(socket: WebSocketLike, request: Request): void {
        this.addPeer(new WebSocketPeerAdapter<Methods, Events>(socket, this.heartbeatOptions), { request })
    }
}
