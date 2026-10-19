import { onReady } from '../__helper/onReady'
import { createHtmlLogger, MessageType } from '../__helper/createHtmlLogger'
import { createRpcChannel } from '@/createRpcChannel'
import { SharedWorkerHostAdapter } from '@/lib/adapter/web-worker'
import type { PageToWorker, WorkerToPage } from './SharedWorkerMessages'

onReady(() => {
    const log = createHtmlLogger(document.querySelector<HTMLUListElement>('#output')!)
    const title = `Tab ${String(Math.floor(Math.random() * 1000))}`
    const worker = new SharedWorker(new URL('./example.worker.ts', import.meta.url), { type: 'module' })
    const channel = createRpcChannel<PageToWorker, WorkerToPage>(new SharedWorkerHostAdapter(worker, 'example'))

    document.querySelector('#title')!.textContent = title

    channel.$.handle('getTitle', () => title)

    channel.$.on('counterChanged', (value) => {
        document.querySelector('#counter')!.textContent = String(value)
        log(MessageType.RECEIVED, 'counterChanged (notification)', value)
    })

    channel.$.on('peersChanged', (count) => {
        document.querySelector('#peers')!.textContent = String(count)
        log(MessageType.RECEIVED, 'peersChanged (notification)', count)
    })

    channel.$.on('rpc.status', (status) => {
        log(MessageType.INFO, `Connection status ${status}`)
    })

    async function call<Result>(name: string, send: () => Promise<Result>): Promise<void> {
        log(MessageType.SENT, name)
        try {
            log(MessageType.RECEIVED, `${name} result`, await send())
        } catch (error) {
            log(MessageType.INFO, `${name} failed`, String(error))
        }
    }

    document
        .querySelector('#increment')
        ?.addEventListener('click', () => void call('increment', () => channel.increment()))

    document
        .querySelector('#collect-titles')
        ?.addEventListener('click', () => void call('collectTitles', () => channel.collectTitles()))
})
