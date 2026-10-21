import { existsSync } from 'node:fs'
import { once } from 'node:events'
import { setTimeout } from 'node:timers/promises'
import { type ChildProcess, fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { ChildProcessHostAdapter } from '@/lib/adapter/child-process'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import type { ChildToParent, ParentToChild } from './fixtures/FixtureMessages'

const DIST = fileURLToPath(new URL('../../../dist', import.meta.url))
const FIXTURE = fileURLToPath(new URL('./fixtures/fixture.child.ts', import.meta.url))

describe.skipIf(!existsSync(DIST))(ChildProcessHostAdapter, () => {
    let child: ChildProcess

    afterEach(() => {
        child.kill()
    })

    function startChannel(killOnDestroy = false) {
        child = fork(FIXTURE, { execArgv: [] })
        return createRpcChannel<ParentToChild, ChildToParent>(
            new ChildProcessHostAdapter(child, 'e2e', { killOnDestroy }),
            { queueEnabled: true },
        )
    }

    it('should call a handler in a child that creates its adapter late', async () => {
        const channel = startChannel()

        await expect(channel.add(2, 3)).resolves.toBe(5)

        channel.$.destroy()
    })

    it('should answer calls from the child', async () => {
        const channel = startChannel()
        channel.$.handle('greet', (name) => `Hello ${name}`)

        await expect(channel.askForGreeting('Ada')).resolves.toBe('Hello Ada')

        channel.$.destroy()
    })

    it('should reject a pending call with CONNECTION_LOST when the child exits', async () => {
        const channel = startChannel()
        await channel.add(1, 1)

        await expect(channel.exit(3)).rejects.toMatchObject({ code: RpcErrorCode.CONNECTION_LOST })
        expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should survive a child that destroys its channel and exits on its own', async () => {
        const uncaughtException = vi.fn<(error: Error) => void>()
        process.on('uncaughtException', uncaughtException)
        const channel = startChannel()
        await channel.add(1, 1)
        const exited = once(child, 'exit')
        const disconnected = new Promise<void>((resolve) => channel.$.on('rpc.disconnected', () => resolve()))

        await channel.shutdown()
        await Promise.all([exited, disconnected])
        await setTimeout(100)
        process.off('uncaughtException', uncaughtException)

        expect(child.listenerCount('error')).toBe(0)
        expect(uncaughtException).not.toHaveBeenCalled()
        expect(channel.$.status).toBe(ConnectionStatus.DISCONNECTED)
    })

    it('should reconnect on its own when the child re-creates its channel', async () => {
        const channel = startChannel()
        await channel.add(1, 1)
        const disconnected = new Promise<void>((resolve) => channel.$.on('rpc.disconnected', () => resolve()))

        await expect(channel.recreateChannel()).resolves.toBe(1)

        await disconnected

        await expect(channel.generation()).resolves.toBe(2)

        channel.$.destroy()
    })

    it('should kill the child on destroy when killOnDestroy is set', async () => {
        const channel = startChannel(true)
        await channel.add(1, 1)
        const exited = once(child, 'exit')

        channel.$.destroy()

        await expect(exited).resolves.toBeDefined()
    })
})
