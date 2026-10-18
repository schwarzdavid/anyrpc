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

    async function computeFibonacci(): Promise<void> {
        log(MessageType.SENT, 'fibonacci', 40)
        try {
            log(MessageType.RECEIVED, 'fibonacci result', await channel.fibonacci(40))
        } catch (error) {
            log(MessageType.INFO, 'fibonacci failed', String(error))
        }
    }

    function blockWorker(): void {
        log(MessageType.SENT, 'block (notification)', 3000)
        try {
            channel.block.notify(3000)
        } catch (error) {
            log(MessageType.INFO, 'block failed', String(error))
        }
    }

    document.querySelector('#send-fibonacci')?.addEventListener('click', () => void computeFibonacci())

    document.querySelector('#send-block')?.addEventListener('click', blockWorker)

    document.querySelector('#terminate')?.addEventListener('click', () => {
        log(MessageType.INFO, 'Terminating worker')
        worker.terminate()
    })
})
