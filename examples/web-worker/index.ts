import { onReady } from '../__helper/onReady'
import { createHtmlLogger, MessageType } from '../__helper/createHtmlLogger'
import { createRpcChannel } from '@/createRpcChannel'
import { WebWorkerHostAdapter } from '@/lib/adapter/web-worker'
import type { HostToWorker, WorkerToHost } from './WebWorkerMessages'

onReady(() => {
    const log = createHtmlLogger(document.querySelector<HTMLUListElement>('#output')!)
    const worker = new Worker(new URL('./example.worker.ts', import.meta.url), { type: 'module' })
    const channel = createRpcChannel<HostToWorker, WorkerToHost>(
        new WebWorkerHostAdapter(worker, 'example', { heartbeat: { interval: 500, timeout: 1000 } }),
    )

    channel.$.on('progress', (step, total) => {
        if (step === total) {
            log(MessageType.RECEIVED, 'progress (notification)', step, total)
        }
    })

    channel.$.on('rpc.status', (status) => {
        log(MessageType.INFO, `Connection status ${status}`)
    })

    document.querySelector('#send-fibonacci')?.addEventListener('click', () => {
        log(MessageType.SENT, 'fibonacci', 40)
        channel.fibonacci(40).then(
            (result) => log(MessageType.RECEIVED, 'fibonacci result', result),
            (error: unknown) => log(MessageType.INFO, 'fibonacci failed', String(error)),
        )
    })

    document.querySelector('#send-block')?.addEventListener('click', () => {
        log(MessageType.SENT, 'block', 3000)
        channel.block.notify(3000)
    })

    document.querySelector('#terminate')?.addEventListener('click', () => {
        log(MessageType.INFO, 'Terminating worker')
        worker.terminate()
    })
})
