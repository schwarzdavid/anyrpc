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

    document.querySelector('#send-ping')?.addEventListener('click', () => {
        log(MessageType.SENT, 'ping')
        void channel.ping()
    })
})
