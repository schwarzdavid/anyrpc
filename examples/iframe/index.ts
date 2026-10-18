import { onReady } from '../__helper/onReady'
import { createHtmlLogger, MessageType } from '../__helper/createHtmlLogger'
import { createRpcChannel } from '@/createRpcChannel'
import { IFrameHostAdapter } from '@/lib/adapter/iframe'
import type { HostToIFrame, IFrameToHost } from './IFrameMessages'

onReady(() => {
    const log = createHtmlLogger(document.querySelector<HTMLUListElement>('#output')!)
    const iframe = document.querySelector<HTMLIFrameElement>('iframe')!
    const channel = createRpcChannel<HostToIFrame, IFrameToHost>(new IFrameHostAdapter(iframe, 'example'))

    channel.$.handle('pong', () => {
        log(MessageType.RECEIVED, 'pong')
    })

    channel.$.on('size', (width, height) => {
        log(MessageType.RECEIVED, 'size', width, height)
    })

    channel.$.on('rpc.status', (status) => {
        log(MessageType.INFO, `Connection status ${status}`)
    })

    async function sendPing(): Promise<void> {
        log(MessageType.SENT, 'ping')
        try {
            await channel.ping()
            log(MessageType.RECEIVED, 'ping answered')
        } catch (error) {
            log(MessageType.INFO, 'ping failed', String(error))
        }
    }

    document.querySelector('#send-ping')?.addEventListener('click', () => void sendPing())
})
