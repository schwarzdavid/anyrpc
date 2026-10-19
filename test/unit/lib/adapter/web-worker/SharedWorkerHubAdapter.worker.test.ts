import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubGlobalScope } from '../../../__helper/stubGlobalScope'
import {
    WebWorkerHostAdapter,
    SharedWorkerHubAdapter,
    type SharedWorkerHubAdapterOptions,
    type SharedWorkerLike,
} from '@/lib/adapter/web-worker'
import { SharedWorkerPeerAdapter } from '@/lib/adapter/web-worker/SharedWorkerPeerAdapter'
import type { PeerHandler, PeerLostHandler } from '@/lib/adapter/AbstractRpcHubAdapter'
import { readControlMethod, ControlMethod } from '@/lib/adapter/message-port/utils/controlMessages'
import { createRpcHub } from '@/createRpcHub'
import { createRpcChannel } from '@/createRpcChannel'
import { LogLevel } from '@/types/LogLevel'
import { confirmHandshake } from '../../../__helper/confirmHandshake'

interface HubToPage {
    getTitle(): string
}

interface PageToHub {
    getCount(): number
}

function initRequest(id = 'init-id', name = 'anyrpc-web-worker-adapter') {
    return { jsonrpc: '2.0', id, method: 'anyrpc::web-worker-init', params: [name] }
}

function nextMessageEvent(port: MessagePort): Promise<MessageEvent> {
    return new Promise((resolve) => {
        port.addEventListener('message', resolve, { once: true })
        port.start()
    })
}

function connectPage(port: MessagePort): void {
    globalThis.dispatchEvent(new MessageEvent('connect', { ports: [port] }))
}

describe(SharedWorkerHubAdapter, () => {
    const channels: MessageChannel[] = []
    let peerHandler: ReturnType<typeof vi.fn<PeerHandler<HubToPage, PageToHub>>>
    let peerLostHandler: ReturnType<typeof vi.fn<PeerLostHandler>>
    let adapter: SharedWorkerHubAdapter<HubToPage, PageToHub>

    function createAdapter(name?: string, options?: Partial<SharedWorkerHubAdapterOptions>) {
        adapter = new SharedWorkerHubAdapter(name, options)
        adapter.initLogger(LogLevel.DEBUG)
        adapter.peerHandler = peerHandler
        adapter.peerLostHandler = peerLostHandler
        return adapter
    }

    function openConnection(): MessagePort {
        const channel = new MessageChannel()
        channels.push(channel)
        connectPage(channel.port1)
        return channel.port2
    }

    async function handshake(pagePort: MessagePort, id = 'init-id'): Promise<MessageEvent> {
        const response = nextMessageEvent(pagePort)
        pagePort.postMessage(initRequest(id))
        return response
    }

    beforeEach(() => {
        stubGlobalScope('SharedWorkerGlobalScope')
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        peerHandler = vi.fn<PeerHandler<HubToPage, PageToHub>>(({ adapter: peer }) => {
            void peer.connect()
        })
        peerLostHandler = vi.fn<PeerLostHandler>()
        createAdapter()
    })

    afterEach(() => {
        adapter.destroy()
        channels.splice(0).forEach((channel) => {
            channel.port1.close()
            channel.port2.close()
        })
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('should refuse to be created outside of a shared worker', () => {
        vi.unstubAllGlobals()

        expect(() => new SharedWorkerHubAdapter()).toThrowError(
            'SharedWorkerHubAdapter must be created inside the shared worker. ' +
                'Use WebWorkerHostAdapter on the pages that connect to the worker.',
        )
    })

    it('should answer the init request of a page with a data and a control port', async () => {
        adapter.connect()

        const response = await handshake(openConnection())

        expect(response.data).toStrictEqual({ jsonrpc: '2.0', id: 'init-id', result: null })
        expect(response.ports).toHaveLength(2)
    })

    it('should hand every connected page to the hub as a peer', async () => {
        adapter.connect()

        await handshake(openConnection())
        await handshake(openConnection())

        expect(peerHandler).toHaveBeenCalledTimes(2)
        expect(peerHandler).toHaveBeenCalledWith({
            id: expect.any(String),
            adapter: expect.any(SharedWorkerPeerAdapter),
        })
    })

    it('should answer a repeated init request only once', async () => {
        adapter.connect()
        const pagePort = openConnection()

        await handshake(pagePort)
        pagePort.postMessage(initRequest())
        await handshake(pagePort, 'next-id')

        expect(peerHandler).toHaveBeenCalledTimes(2)
    })

    it('should ignore init requests for other names and unrelated messages', async () => {
        createAdapter('my-app').connect()
        const pagePort = openConnection()

        pagePort.postMessage(initRequest('other-id'))
        pagePort.postMessage({ type: 'unrelated' })
        const response = nextMessageEvent(pagePort)
        pagePort.postMessage(initRequest('init-id', 'my-app'))
        await response

        expect(peerHandler).toHaveBeenCalledTimes(1)
    })

    it('should warn about connections without a message port', () => {
        adapter.connect()

        globalThis.dispatchEvent(new MessageEvent('connect'))

        expect(console.warn).toHaveBeenCalledWith(
            '[SharedWorkerHubAdapter]',
            'Ignored a connection without a message port',
        )
    })

    it('should report a peer as lost once its connection is closed', async () => {
        adapter.connect()

        await handshake(openConnection())
        const [{ id, adapter: peer }] = peerHandler.mock.calls[0]!
        peer.destroy()

        expect(peerLostHandler).toHaveBeenCalledExactlyOnceWith(id)
    })

    it('should check the heartbeat of every peer', async () => {
        createAdapter(undefined, { heartbeat: { interval: 10, timeout: 1000 } }).connect()
        const [, controlPort] = (await handshake(openConnection())).ports as [MessagePort, MessagePort]
        await confirmHandshake(controlPort)

        await vi.waitFor(() => expect(nextControlMethod(controlPort)).resolves.toBe(ControlMethod.PING))
    })

    it('should remove peers that stop answering the heartbeat', async () => {
        createAdapter(undefined, { heartbeat: { interval: 10, timeout: 10 } }).connect()
        const [, controlPort] = (await handshake(openConnection())).ports as [MessagePort, MessagePort]
        await confirmHandshake(controlPort)

        await vi.waitFor(() => expect(peerLostHandler).toHaveBeenCalledTimes(1))
    })

    it('should stop accepting pages once destroyed', async () => {
        adapter.connect()
        const pagePort = openConnection()

        adapter.destroy()
        pagePort.postMessage(initRequest())
        connectPage(new MessageChannel().port1)
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(peerHandler).not.toHaveBeenCalled()
    })

    it('should not listen twice when connecting twice', async () => {
        adapter.connect()
        adapter.connect()

        await handshake(openConnection())

        expect(peerHandler).toHaveBeenCalledTimes(1)
    })

    it('should connect pages to a hub through the WebWorkerHostAdapter', async () => {
        const hub = createRpcHub<HubToPage, PageToHub>(new SharedWorkerHubAdapter(), { logLevel: LogLevel.NONE })
        let count = 0
        hub.$.handle('getCount', () => ++count)
        const pages = ['first', 'second'].map((title) => {
            const pagePort = openConnection()
            const sharedWorker: SharedWorkerLike = { port: pagePort, addEventListener: () => undefined }
            const page = createRpcChannel<PageToHub, HubToPage>(new WebWorkerHostAdapter(sharedWorker), {
                logLevel: LogLevel.NONE,
                queueEnabled: true,
            })
            page.$.handle('getTitle', () => title)
            return page
        })

        await expect(pages[0]!.getCount()).resolves.toBe(1)
        await expect(pages[1]!.getCount()).resolves.toBe(2)

        await vi.waitFor(() => expect(hub.$.peers).toHaveLength(2))

        await expect(Promise.all(hub.getTitle())).resolves.toStrictEqual(['first', 'second'])

        pages[0]!.$.destroy()

        await vi.waitFor(() => expect(hub.$.peers).toHaveLength(1))
        pages[1]!.$.destroy()
        hub.$.destroy()
    })
})

function nextControlMethod(port: MessagePort): Promise<ControlMethod | undefined> {
    return nextMessageEvent(port).then((event) => readControlMethod(event.data))
}
