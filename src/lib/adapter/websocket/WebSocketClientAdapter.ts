import type { MethodMap } from '@/types/MethodMap'
import { AbstractSocketAdapter } from '@/lib/adapter/socket/AbstractSocketAdapter'
import { type HeartbeatOption, resolveHeartbeatOptions } from '@/lib/Heartbeat'
import { NORMAL_CLOSURE, WEBSOCKET_OPEN } from './constants/webSocket'
import { reconnectDelay } from './utils/reconnectDelay'

export interface WebSocketClientAdapterOptions {
    reconnect: boolean
    heartbeat: HeartbeatOption
}

interface OpenSocket {
    socket: WebSocket
    listeners: AbortController
}

export class WebSocketClientAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractSocketAdapter<Methods, Events> {
    private readonly reconnect: boolean
    private current: OpenSocket | undefined
    private reconnectTimeoutId: ReturnType<typeof setTimeout> | undefined
    private reconnectAttempts = 0

    constructor(
        private readonly url: string | URL,
        options?: Partial<WebSocketClientAdapterOptions>,
    ) {
        super(resolveHeartbeatOptions(options?.heartbeat ?? false))
        this.reconnect = options?.reconnect ?? true
    }

    connect(): void {
        const hadSocket = this.current !== undefined
        this.dropSocket()
        if (hadSocket) {
            this.closed()
        }
        this.openSocket()
    }

    protected send(message: object): void {
        if (this.current?.socket.readyState === WEBSOCKET_OPEN) {
            this.current.socket.send(JSON.stringify(message))
        }
    }

    protected override onRemoteGoodbye(): void {
        this.handleConnectionLost()
    }

    protected override onRemoteUnresponsive(): void {
        this.handleConnectionLost()
    }

    override destroy(): void {
        super.destroy()
        this.dropSocket()
    }

    private openSocket(): void {
        const socket = new WebSocket(this.url)
        const listeners = new AbortController()
        const { signal } = listeners

        socket.addEventListener('open', () => this.handleOpen(), { signal })
        socket.addEventListener('message', (event) => this.handleMessage(event.data), { signal })
        socket.addEventListener('close', () => this.handleConnectionLost(), { signal })
        this.current = { socket, listeners }
    }

    private handleOpen(): void {
        this.reconnectAttempts = 0
        this.logger?.debug(`Connected to ${String(this.url)}`)
        this.opened()
    }

    private handleMessage(data: unknown): void {
        if (typeof data !== 'string') {
            this.logger?.warn('Ignored a binary message: the WebSocket adapter only supports text messages')
            return
        }
        this.receive(data)
    }

    private handleConnectionLost(): void {
        this.dropSocket()
        this.closed()
        this.scheduleReconnect()
    }

    private scheduleReconnect(): void {
        if (!this.reconnect) {
            return
        }
        const delay = reconnectDelay(this.reconnectAttempts)
        this.reconnectAttempts++
        this.logger?.info(`Reconnecting to ${String(this.url)} in ${String(delay)} ms`)
        this.reconnectTimeoutId = setTimeout(() => this.openSocket(), delay)
    }

    private dropSocket(): void {
        clearTimeout(this.reconnectTimeoutId)
        this.current?.listeners.abort()
        this.current?.socket.close(NORMAL_CLOSURE)
        this.current = undefined
    }
}
