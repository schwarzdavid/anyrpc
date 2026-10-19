import { createRpcHub } from '@/createRpcHub'
import { SharedWorkerHubAdapter } from '@/lib/adapter/web-worker'
import type { PageToWorker, WorkerToPage } from './SharedWorkerMessages'

const hub = createRpcHub<WorkerToPage, PageToWorker>(
    new SharedWorkerHubAdapter('example', { heartbeat: { interval: 1000, timeout: 2000 } }),
)
let counter = 0

function announcePeers(): void {
    hub.peersChanged.notify(hub.$.peers.length)
}

hub.$.on('rpc.peer.connected', announcePeers)
hub.$.on('rpc.peer.disconnected', announcePeers)

hub.$.handle('increment', () => {
    counter++
    hub.counterChanged.notify(counter)
    return counter
})

hub.$.handle('collectTitles', async () => {
    const results = await Promise.allSettled(hub.getTitle())
    return results.map((result) => (result.status === 'fulfilled' ? result.value : 'no answer'))
})
