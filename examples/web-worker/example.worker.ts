import { createRpcChannel } from '@/createRpcChannel'
import { WebWorkerClientAdapter } from '@/lib/adapter/web-worker'
import type { HostToWorker, WorkerToHost } from './WebWorkerMessages'

const channel = createRpcChannel<WorkerToHost, HostToWorker>(new WebWorkerClientAdapter('example'))

channel.$.handle('fibonacci', (n) => {
    let [previous, current] = [0, 1]
    for (let step = 1; step <= n; step++) {
        ;[previous, current] = [current, previous + current]
        channel.progress.notify(step, n)
    }
    return previous
})

channel.$.handle('block', (milliseconds) => {
    let now = Date.now()
    const end = now + milliseconds
    while (now < end) {
        now = Date.now()
    }
})
