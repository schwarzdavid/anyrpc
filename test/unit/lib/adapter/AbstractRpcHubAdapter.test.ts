import { describe, expect, it, vi } from 'vitest'
import { AbstractRpcHubAdapter, type PeerHandler, type PeerLostHandler } from '@/lib/adapter/AbstractRpcHubAdapter'
import { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import { Logger } from '@/lib/Logger'
import { LogLevel } from '@/types/LogLevel'

interface TestMethods {
    ping(): void
}

class TestPeerAdapter extends AbstractRpcAdapter<TestMethods, TestMethods> {
    connect = vi.fn<() => void>()
    sendMessage = vi.fn<() => void>()
}

class TestHubAdapter extends AbstractRpcHubAdapter<TestMethods, TestMethods> {
    connect = vi.fn<() => void>()
    destroy = vi.fn<() => void>()

    join(adapter: TestPeerAdapter): string {
        return this.addPeer(adapter)
    }

    leave(id: string): void {
        this.removePeer(id)
    }

    get currentLogger(): Logger | undefined {
        return this.logger
    }
}

describe(AbstractRpcHubAdapter, () => {
    it('should hand every new peer to the peer handler with a unique id', () => {
        const hubAdapter = new TestHubAdapter()
        const peerHandler = vi.fn<PeerHandler<TestMethods, TestMethods>>()
        const firstAdapter = new TestPeerAdapter()
        const secondAdapter = new TestPeerAdapter()
        hubAdapter.peerHandler = peerHandler

        const firstId = hubAdapter.join(firstAdapter)
        const secondId = hubAdapter.join(secondAdapter)

        expect(firstId).not.toBe(secondId)
        expect(peerHandler).toHaveBeenNthCalledWith(1, { id: firstId, adapter: firstAdapter })
        expect(peerHandler).toHaveBeenNthCalledWith(2, { id: secondId, adapter: secondAdapter })
    })

    it('should report a lost peer by its id', () => {
        const hubAdapter = new TestHubAdapter()
        const peerLostHandler = vi.fn<PeerLostHandler>()
        hubAdapter.peerLostHandler = peerLostHandler

        hubAdapter.leave('peer-id')

        expect(peerLostHandler).toHaveBeenCalledExactlyOnceWith('peer-id')
    })

    it('should not fail when peers come and go before any handler is set', () => {
        const hubAdapter = new TestHubAdapter()

        expect(() => hubAdapter.leave(hubAdapter.join(new TestPeerAdapter()))).not.toThrowError()
    })

    it('should create a logger named after the adapter class', () => {
        const hubAdapter = new TestHubAdapter()
        const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        hubAdapter.initLogger(LogLevel.WARN)
        hubAdapter.currentLogger?.warn('message')

        expect(hubAdapter.currentLogger).toBeInstanceOf(Logger)
        expect(logSpy).toHaveBeenCalledExactlyOnceWith('[TestHubAdapter]', 'message')
    })
})
