import type { MethodMap } from '@/types/MethodMap'
import { AbstractRpcHubAdapter } from '@/lib/adapter/AbstractRpcHubAdapter'
import { type HeartbeatOption, type HeartbeatOptions, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import { type WebSocketLike, WebSocketPeerAdapter } from './WebSocketPeerAdapter'

export interface WebSocketServerLike {
    on(event: 'connection', listener: (socket: WebSocketLike) => void): unknown
    off(event: 'connection', listener: (socket: WebSocketLike) => void): unknown
}

export interface WebSocketHubAdapterOptions {
    heartbeat: HeartbeatOption
}

export class WebSocketHubAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractRpcHubAdapter<Methods, Events> {
    private readonly heartbeatOptions: HeartbeatOptions | undefined
    private readonly onConnection = (socket: WebSocketLike) => this.acceptSocket(socket)

    constructor(
        private readonly server: WebSocketServerLike,
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

    private acceptSocket(socket: WebSocketLike): void {
        const peer = new WebSocketPeerAdapter<Methods, Events>(socket, this.heartbeatOptions)
        const id = this.addPeer(peer)

        peer.closedHandler = () => this.removePeer(id)
    }
}
