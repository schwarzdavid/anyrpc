import { onReady } from '../__helper/onReady'
import { createHtmlLogger, MessageType } from '../__helper/createHtmlLogger'
import { createRpcChannel } from '@/createRpcChannel'
import { IFrameHostAdapter } from '@/lib/adapter/iframe'
import { HostToIFrame, IFrameToHost } from './IFrameMessages'

onReady(() => {
    const log = createHtmlLogger(document.querySelector<HTMLUListElement>('#output')!)
    const iframe = document.querySelector<HTMLIFrameElement>('iframe')!
    const channel = createRpcChannel<HostToIFrame, IFrameToHost>(new IFrameHostAdapter(iframe, 'example'))

    channel.addEventListener('pong', () => {
        log(MessageType.RECEIVED, 'pong')
    })

    channel.addEventListener('size', (width, height) => {
        log(MessageType.RECEIVED, 'size', width, height)
    })

    document.querySelector('#send-ping')?.addEventListener('click', () => {
        log(MessageType.SENT, 'ping')
        void channel.ping()
    })
})
