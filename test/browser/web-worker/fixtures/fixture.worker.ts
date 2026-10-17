import { createRpcChannel } from '@/createRpcChannel'
import { WebWorkerClientAdapter } from '@/lib/adapter/web-worker/client'
import { LogLevel } from '@/types/LogLevel'
import type { HostToSecondChannel, HostToWorker, WorkerToHost } from './FixtureMessages'

const channel = createRpcChannel<WorkerToHost, HostToWorker>(new WebWorkerClientAdapter('fixture'), {
    logLevel: LogLevel.NONE,
})

channel.$.handle('echo', (value) => value)
channel.$.handle('askHost', (name) => channel.greet(name))
channel.$.handle('block', (milliseconds) => {
    let now = Date.now()
    const end = now + milliseconds
    while (now < end) {
        now = Date.now()
    }
})
channel.$.handle('wait', (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
channel.$.handle('throwUncaught', (message) => {
    setTimeout(() => {
        throw new Error(message)
    })
})
channel.$.handle('destroyChannel', () => {
    setTimeout(() => channel.$.destroy())
})

const secondChannel = createRpcChannel<Record<never, never>, HostToSecondChannel>(
    new WebWorkerClientAdapter('second'),
    { logLevel: LogLevel.NONE },
)

secondChannel.$.handle('whoAmI', () => 'second')
