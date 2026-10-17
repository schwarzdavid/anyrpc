import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRpcChannel, type RpcChannelOptions } from '@/createRpcChannel'
import { WebWorkerHostAdapter, type WebWorkerHostAdapterOptions } from '@/lib/adapter/web-worker/host'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { RpcChannel } from '@/types/RpcChannel'
import type { HostToSecondChannel, HostToWorker, WorkerToHost } from './fixtures/FixtureMessages'

type FixtureChannel = RpcChannel<HostToWorker, WorkerToHost>

function startWorker(url = new URL('./fixtures/fixture.worker.ts', import.meta.url)): Worker {
    return new Worker(url, { type: 'module' })
}

function waitUntilConnected(channel: { $: { status: ConnectionStatus } }): Promise<void> {
    return vi.waitFor(() => expect(channel.$.status).toBe(ConnectionStatus.CONNECTED))
}

describe(WebWorkerHostAdapter, () => {
    const workers: Worker[] = []
    const channels: { $: { destroy(): void } }[] = []

    function connect(
        worker: Worker,
        adapterOptions: Partial<WebWorkerHostAdapterOptions> = {},
        channelOptions: Partial<RpcChannelOptions> = {},
    ): FixtureChannel {
        const channel = createRpcChannel<HostToWorker, WorkerToHost>(
            new WebWorkerHostAdapter(worker, 'fixture', adapterOptions),
            { logLevel: LogLevel.NONE, ...channelOptions },
        )
        channel.$.handle('greet', (name) => `Hello ${name}`)
        channels.push(channel)
        return channel
    }

    beforeEach(() => {
        workers.push(startWorker())
    })

    afterEach(() => {
        channels.splice(0).forEach((channel) => channel.$.destroy())
        workers.splice(0).forEach((worker) => worker.terminate())
        vi.restoreAllMocks()
    })

    it('should call methods in both directions', async () => {
        const channel = connect(workers[0]!)
        await waitUntilConnected(channel)

        await expect(channel.echo('ping')).resolves.toBe('ping')
        await expect(channel.askHost('worker')).resolves.toBe('Hello worker')
    })

    it('should queue calls made before the worker has started', async () => {
        const channel = connect(workers[0]!, {}, { queueEnabled: true })

        await expect(channel.echo('early')).resolves.toBe('early')
    })

    it('should run independent channels with different names over one worker', async () => {
        const channel = connect(workers[0]!)
        const secondChannel = createRpcChannel<HostToSecondChannel, Record<never, never>>(
            new WebWorkerHostAdapter(workers[0]!, 'second'),
            { logLevel: LogLevel.NONE },
        )
        channels.push(secondChannel)
        await waitUntilConnected(channel)
        await waitUntilConnected(secondChannel)

        await expect(secondChannel.whoAmI()).resolves.toBe('second')
        await expect(channel.echo('first')).resolves.toBe('first')
    })

    it('should disconnect and reject pending calls when the worker channel is destroyed', async () => {
        const channel = connect(workers[0]!)
        await waitUntilConnected(channel)

        const pendingCall = channel.wait(1000)
        await channel.destroyChannel()

        await expect(pendingCall).rejects.toMatchObject({ code: RpcErrorCode.CONNECTION_LOST })
        expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should reconnect to a new host adapter after the previous one was destroyed', async () => {
        const firstChannel = connect(workers[0]!)
        await waitUntilConnected(firstChannel)

        firstChannel.$.destroy()
        const secondChannel = connect(workers[0]!, {}, { queueEnabled: true })

        await expect(secondChannel.echo('again')).resolves.toBe('again')
    })

    it('should report a terminated worker as disconnected with the heartbeat', async () => {
        const channel = connect(workers[0]!, { heartbeat: { interval: 50, timeout: 100 } }, { timeout: 500 })
        await waitUntilConnected(channel)

        const pendingCall = channel.block(1000)
        workers[0]!.terminate()

        await vi.waitFor(() => expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED))

        await expect(pendingCall).rejects.toMatchObject({ code: RpcErrorCode.TIMEOUT_ERROR })
    })

    it('should report a busy worker as disconnected and recover once it answers again', async () => {
        const channel = connect(workers[0]!, { heartbeat: { interval: 50, timeout: 100 } })
        const statuses: ConnectionStatus[] = []
        await waitUntilConnected(channel)
        channel.$.on('rpc.status', (status) => statuses.push(status))

        const callDuringBlock = channel.block(500)

        await vi.waitFor(
            () => expect(statuses).toStrictEqual([ConnectionStatus.DISCONNECTED, ConnectionStatus.CONNECTED]),
            {
                timeout: 2000,
            },
        )

        await expect(callDuringBlock).resolves.toBeNull()
        await expect(channel.echo('back')).resolves.toBe('back')
    })

    it('should log uncaught errors of the worker', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const channel = connect(workers[0]!, {}, { logLevel: LogLevel.ERROR })
        await waitUntilConnected(channel)

        channel.throwUncaught.notify('boom')

        await vi.waitFor(() =>
            expect(errorSpy).toHaveBeenCalledWith(
                '[WebWorkerHostAdapter]',
                expect.stringMatching(/^Uncaught error in web worker: .*boom \(.*fixture\.worker\.ts.*:\d+:\d+\)$/),
            ),
        )
    })

    it('should explain why a worker that fails to load never connects', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const brokenWorker = startWorker(new URL('./fixtures/does-not-exist.js', import.meta.url))
        workers.push(brokenWorker)

        connect(brokenWorker, {}, { logLevel: LogLevel.ERROR })

        await vi.waitFor(() =>
            expect(errorSpy).toHaveBeenCalledWith(
                '[WebWorkerHostAdapter]',
                expect.stringContaining('The web worker could not be started'),
            ),
        )
    })
})
