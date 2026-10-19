import { createRpcHub } from '@/createRpcHub'
import { SharedWorkerHubAdapter } from '@/lib/adapter/web-worker'
import { LogLevel } from '@/types/LogLevel'
import type { PageToWorker, WorkerToPage } from './FixtureMessages'

const hub = createRpcHub<WorkerToPage, PageToWorker>(
    new SharedWorkerHubAdapter('fixture', { heartbeat: { interval: 100, timeout: 200 } }),
    { logLevel: LogLevel.NONE },
)

hub.$.handle('whoAmI', ({ peer }) => peer.id)
hub.$.handle('peerCount', () => hub.$.peers.length)
hub.$.handle('announce', (_context, message) => {
    hub.announced.notify(message)
})
hub.$.handle('collectNames', () => Promise.all(hub.getName()))
