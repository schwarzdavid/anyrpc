import { setTimeout } from 'node:timers/promises'
import { createRpcChannel } from 'anyrpc'
import { NodeWorkerClientAdapter } from 'anyrpc/adapters/node-worker'
import type { MainToWorker, WorkerToMain } from './FixtureMessages'

await setTimeout(1500)

const channel = createRpcChannel<WorkerToMain, MainToWorker>(new NodeWorkerClientAdapter('e2e'), {
    queueEnabled: true,
})

channel.$.handle('add', (a, b) => a + b)
channel.$.handle('askForGreeting', (name) => channel.greet(name))
channel.$.handle('exit', (code) => process.exit(code))
