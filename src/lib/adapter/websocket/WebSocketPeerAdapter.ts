import type { MethodMap } from '@/types/MethodMap'
import type { HeartbeatOptions } from '@/lib/Heartbeat'
import { AbstractSocketAdapter } from '@/lib/adapter/socket/AbstractSocketAdapter'
import { NORMAL_CLOSURE, WEBSOCKET_OPEN } from './constants/webSocket'

export interface WebSocketMessageEvent {
    readonly data: unknown
}

export interface WebSocketLike {
    readonly readyState: number
    send(data: string): void
    close(code?: number, reason?: string): void
    addEventListener(type: 'message', listener: (event: WebSocketMessageEvent) => void): void
    addEventListener(type: 'close' | 'error', listener: () => void): void
}

export type PeerClosedHandler = () => void

export class WebSocketPeerAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractSocketAdapter<Methods, Events> {
    private _closedHandler?: PeerClosedHandler

    constructor(
        private readonly socket: WebSocketLike,
        heartbeatOptions: HeartbeatOptions | undefined,
    ) {
        super(heartbeatOptions)
    }

    set closedHandler(handler: PeerClosedHandler) {
        this._closedHandler = handler
    }

    connect(): void {
        this.socket.addEventListener('message', (event) => this.handleMessage(event.data))
        this.socket.addEventListener('close', () => this.closed())
        this.socket.addEventListener('error', () => this.logger?.warn('The WebSocket connection reported an error'))
        this.opened()
    }

    protected send(message: object): void {
        if (this.socket.readyState === WEBSOCKET_OPEN) {
            this.socket.send(JSON.stringify(message))
        }
    }

    protected override onRemoteGoodbye(): void {
        super.onRemoteGoodbye()
        this.socket.close(NORMAL_CLOSURE)
    }

    protected override onRemoteUnresponsive(): void {
        this.destroy()
    }

    protected override closeConnection(): void {
        super.closeConnection()
        this._closedHandler?.()
    }

    override destroy(): void {
        super.destroy()
        this.socket.close(NORMAL_CLOSURE)
    }

    private handleMessage(data: unknown): void {
        if (typeof data !== 'string') {
            this.logger?.warn('Ignored a binary message: the WebSocket adapter only supports text messages')
            return
        }
        this.receive(data)
    }
}
