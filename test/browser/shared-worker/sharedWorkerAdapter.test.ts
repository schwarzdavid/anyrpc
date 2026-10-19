import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { SharedWorkerHubAdapter, WebWorkerHostAdapter } from '@/lib/adapter/web-worker'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { RpcChannel } from '@/types/RpcChannel'
import { uuid } from '@/utils/uuid'
import type { PageToWorker, WorkerToPage } from './fixtures/FixtureMessages'

type PageChannel = RpcChannel<PageToWorker, WorkerToPage>

describe(SharedWorkerHubAdapter, () => {
    const channels: PageChannel[] = []

    function openPages(...names: string[]): Promise<PageChannel[]> {
        const workerName = uuid()
        const pages = names.map((name) => {
            const worker = new SharedWorker(new URL('./fixtures/fixture.worker.ts', import.meta.url), {
                type: 'module',
                name: workerName,
            })
            const channel = createRpcChannel<PageToWorker, WorkerToPage>(new WebWorkerHostAdapter(worker, 'fixture'), {
                logLevel: LogLevel.NONE,
            })
            channel.$.handle('getName', () => name)
            channels.push(channel)
            return channel
        })
        return vi
            .waitFor(() => pages.forEach((page) => expect(page.$.status).toBe(ConnectionStatus.CONNECTED)))
            .then(() => pages)
    }

    afterEach(() => {
        channels.splice(0).forEach((channel) => channel.$.destroy())
    })

    it('should connect every page as a separate peer of the shared worker', async () => {
        const [first, second] = await openPages('first', 'second')

        await expect(first!.peerCount()).resolves.toBe(2)
        await expect(first!.whoAmI()).resolves.not.toBe(await second!.whoAmI())
    })

    it('should broadcast notifications to every page', async () => {
        const [first, second] = await openPages('first', 'second')
        const firstListener = vi.fn<(message: string) => void>()
        const secondListener = vi.fn<(message: string) => void>()
        first!.$.on('announced', firstListener)
        second!.$.on('announced', secondListener)

        await first!.announce('hello')

        await vi.waitFor(() => expect(secondListener).toHaveBeenCalledExactlyOnceWith('hello'))

        expect(firstListener).toHaveBeenCalledExactlyOnceWith('hello')
    })

    it('should call every page and collect the results', async () => {
        const [first] = await openPages('first', 'second')

        await expect(first!.collectNames()).resolves.toStrictEqual(['first', 'second'])
    })

    it('should remove a page from the hub once its channel is destroyed', async () => {
        const [first, second] = await openPages('first', 'second')

        first!.$.destroy()

        await vi.waitFor(() => expect(second!.peerCount()).resolves.toBe(1))

        await expect(second!.collectNames()).resolves.toStrictEqual(['second'])
    })
})
