import { existsSync } from 'node:fs'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { NodeWorkerHostAdapter } from '@/lib/adapter/node-worker'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import type { MainToWorker, WorkerToMain } from './fixtures/FixtureMessages'

const DIST = fileURLToPath(new URL('../../../dist', import.meta.url))

describe.skipIf(!existsSync(DIST))(NodeWorkerHostAdapter, () => {
    let worker: Worker

    afterEach(async () => {
        await worker.terminate()
    })

    function startChannel(terminateOnDestroy = false) {
        worker = new Worker(new URL('./fixtures/fixture.worker.ts', import.meta.url))
        return createRpcChannel<MainToWorker, WorkerToMain>(
            new NodeWorkerHostAdapter(worker, 'e2e', { terminateOnDestroy }),
            { queueEnabled: true },
        )
    }

    it('should call a handler inside a worker that creates its adapter after an async setup', async () => {
        const channel = startChannel()

        await expect(channel.add(2, 3)).resolves.toBe(5)

        channel.$.destroy()
    })

    it('should answer calls from the worker', async () => {
        const channel = startChannel()
        channel.$.handle('greet', (name) => `Hello ${name}`)

        await expect(channel.askForGreeting('Ada')).resolves.toBe('Hello Ada')

        channel.$.destroy()
    })

    it('should reject a pending call with CONNECTION_LOST when the worker exits', async () => {
        const channel = startChannel()
        await channel.add(1, 1)

        await expect(channel.exit(3)).rejects.toMatchObject({ code: RpcErrorCode.CONNECTION_LOST })
        expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should terminate the worker on destroy when terminateOnDestroy is set', async () => {
        const channel = startChannel(true)
        await channel.add(1, 1)
        const exited = once(worker, 'exit')

        channel.$.destroy()

        await expect(exited).resolves.toBeDefined()
    })
})
