import { vi } from 'vitest'
import type { WebSocketLike, WebSocketMessageEvent } from '@/lib/adapter/websocket/WebSocketPeerAdapter'

export class FakeSocket implements WebSocketLike {
    readyState = 1
    readonly send = vi.fn<(data: string) => void>()
    readonly close = vi.fn<(code?: number) => void>()
    private readonly events = new EventTarget()

    addEventListener(type: 'message' | 'close' | 'error', listener: (event: WebSocketMessageEvent) => void): void {
        this.events.addEventListener(type, (event) => listener(event as MessageEvent))
    }

    receive(data: unknown): void {
        this.events.dispatchEvent(new MessageEvent('message', { data }))
    }

    closeFromRemote(): void {
        this.readyState = 3
        this.events.dispatchEvent(new Event('close'))
    }

    fail(): void {
        this.events.dispatchEvent(new Event('error'))
    }

    sent(): unknown[] {
        return this.send.mock.calls.map(([data]) => JSON.parse(data) as unknown)
    }
}
