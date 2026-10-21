import { Worker } from 'node:worker_threads'
import { createRpcChannel } from '@schwarzdavid/anyrpc'
import { NodeWorkerHostAdapter } from '@schwarzdavid/anyrpc/adapters/node-worker'
import type { MainToWorker, WorkerToMain } from './NodeWorkerMessages'

const worker = new Worker(new URL('./worker.ts', import.meta.url))
const channel = createRpcChannel<MainToWorker, WorkerToMain>(
    new NodeWorkerHostAdapter(worker, 'example', { terminateOnDestroy: true }),
    { queueEnabled: true },
)

channel.$.on('progress', (step, total) => {
    console.log(`Step ${String(step)} of ${String(total)}`)
})

console.log(`fibonacci(30) = ${String(await channel.fibonacci(30))}`)
channel.$.destroy()
