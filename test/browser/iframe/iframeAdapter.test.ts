import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRpcChannel, type RpcChannelOptions } from '@/createRpcChannel'
import { IFrameHostAdapter, type IFrameHostAdapterOptions } from '@/lib/adapter/iframe'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { RpcChannel } from '@/types/RpcChannel'
import type { HostToIFrame, IFrameToHost } from './fixtures/FixtureMessages'

type FixtureChannel = RpcChannel<HostToIFrame, IFrameToHost>

const FIXTURE_URL = new URL('./fixtures/fixture.html', import.meta.url)
const HEARTBEAT = { interval: 50, timeout: 100 }

function waitUntilConnected(channel: { $: { status: ConnectionStatus } }): Promise<void> {
    return vi.waitFor(() => expect(channel.$.status).toBe(ConnectionStatus.CONNECTED))
}

function settle(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

describe(IFrameHostAdapter, () => {
    const iframes: HTMLIFrameElement[] = []
    const channels: { $: { destroy(): void } }[] = []

    function embed(query: Record<string, string> = {}): HTMLIFrameElement {
        const url = new URL(FIXTURE_URL)
        Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value))
        const iframe = document.createElement('iframe')
        iframe.src = url.href
        document.body.append(iframe)
        iframes.push(iframe)
        return iframe
    }

    function connect(
        iframe: HTMLIFrameElement,
        adapterOptions: Partial<IFrameHostAdapterOptions> = {},
        channelOptions: Partial<RpcChannelOptions> = {},
    ): FixtureChannel {
        const channel = createRpcChannel<HostToIFrame, IFrameToHost>(
            new IFrameHostAdapter(iframe, 'fixture', { origin: window.location.origin, ...adapterOptions }),
            { logLevel: LogLevel.NONE, ...channelOptions },
        )
        channel.$.handle('greet', (name) => `Hello ${name}`)
        channels.push(channel)
        return channel
    }

    afterEach(() => {
        channels.splice(0).forEach((channel) => channel.$.destroy())
        iframes.splice(0).forEach((iframe) => iframe.remove())
    })

    it('should call methods in both directions', async () => {
        const channel = connect(embed())
        await waitUntilConnected(channel)

        await expect(channel.echo('ping')).resolves.toBe('ping')
        await expect(channel.askHost('iframe')).resolves.toBe('Hello iframe')
    })

    it('should queue calls made before the iframe has loaded', async () => {
        const channel = connect(embed(), {}, { queueEnabled: true })

        await expect(channel.echo('early')).resolves.toBe('early')
    })

    it('should reject with the error thrown by the remote handler', async () => {
        const channel = connect(embed())
        await waitUntilConnected(channel)

        await expect(channel.fail('boom')).rejects.toMatchObject({
            code: RpcErrorCode.SERVER_ERROR,
            data: { name: 'Error', message: 'boom' },
        })
    })

    it('should pass application error codes of the remote handler through unchanged', async () => {
        const channel = connect(embed())
        await waitUntilConnected(channel)

        await expect(channel.failWithCode(4001, 'Insufficient funds')).rejects.toMatchObject({
            code: 4001,
            message: 'Insufficient funds',
        })
    })

    it('should answer with an internal error if the result of the remote handler cannot be cloned', async () => {
        const channel = connect(embed())
        await waitUntilConnected(channel)

        await expect(channel.unclonable()).rejects.toMatchObject({
            code: RpcErrorCode.INTERNAL_ERROR,
            data: { name: 'DataCloneError' },
        })
    })

    it('should deliver notifications in both directions', async () => {
        const channel = connect(embed())
        const listener = vi.fn<(value: string) => void>()
        channel.$.on('reported', listener)
        await waitUntilConnected(channel)

        channel.report.notify('event')

        await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('reported: event'))
    })

    it('should time out if the iframe does not answer in time', async () => {
        const channel = connect(embed(), {}, { timeout: 100 })
        await waitUntilConnected(channel)

        await expect(channel.wait(1000)).rejects.toMatchObject({ code: RpcErrorCode.TIMEOUT_ERROR })
    })

    it('should disconnect and reject pending calls when the iframe channel is destroyed', async () => {
        const channel = connect(embed())
        await waitUntilConnected(channel)

        const pendingCall = channel.wait(1000)
        await channel.destroyChannel()

        await expect(pendingCall).rejects.toMatchObject({ code: RpcErrorCode.CONNECTION_LOST })
        expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should reconnect after the iframe reloaded and reject calls to the old document', async () => {
        const iframe = embed()
        const channel = connect(iframe)
        const statuses: ConnectionStatus[] = []
        await waitUntilConnected(channel)
        channel.$.on('rpc.status', (status) => statuses.push(status))

        const pendingCall = channel.wait(5000)
        iframe.contentWindow?.location.reload()

        await expect(pendingCall).rejects.toMatchObject({ code: RpcErrorCode.CONNECTION_LOST })

        await vi.waitFor(() =>
            expect(statuses).toStrictEqual([ConnectionStatus.DISCONNECTED, ConnectionStatus.CONNECTED]),
        )

        await expect(channel.echo('after reload')).resolves.toBe('after reload')
    })

    it('should stay disconnected after a reload if reconnect is disabled', async () => {
        const iframe = embed()
        const channel = connect(iframe, { reconnect: false, heartbeat: HEARTBEAT })
        await waitUntilConnected(channel)

        iframe.contentWindow?.location.reload()
        await vi.waitFor(() => expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED))
        await settle(300)

        expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should report the iframe as disconnected with the heartbeat after it navigated away', async () => {
        const iframe = embed()
        const channel = connect(iframe, { heartbeat: HEARTBEAT })
        await waitUntilConnected(channel)

        iframe.src = 'about:blank'

        await vi.waitFor(() => expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED))
    })

    it.each([
        ['the iframe does not accept the origin of the host', {}, { origin: 'https://other.example' }],
        ['the host does not accept the origin of the iframe', { origin: 'https://other.example' }, {}],
        ['the iframe posts the handshake to another origin', {}, { postMessageOrigin: 'https://other.example' }],
        ['the host posts the handshake to another origin', { postMessageOrigin: 'https://other.example' }, {}],
    ])('should never connect if %s', async (_, adapterOptions, query) => {
        const channel = connect(embed(query), adapterOptions)

        await settle(500)

        expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED)
    })
})
