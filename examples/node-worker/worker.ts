import { createRpcChannel } from 'anyrpc'
import { NodeWorkerClientAdapter } from 'anyrpc/adapters/node-worker'
import type { MainToWorker, WorkerToMain } from './NodeWorkerMessages'

const channel = createRpcChannel<WorkerToMain, MainToWorker>(new NodeWorkerClientAdapter('example'))
const connected = new Promise<void>((resolve) => channel.$.on('rpc.connected', resolve))

channel.$.handle('fibonacci', async (n) => {
    await connected
    let [previous, current] = [0, 1]
    for (let step = 1; step <= n; step++) {
        ;[previous, current] = [current, previous + current]
        channel.progress.notify(step, n)
    }
    return previous
})
