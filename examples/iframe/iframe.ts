import { onReady } from '../__helper/onReady'
import { createHtmlLogger, MessageType } from '../__helper/createHtmlLogger'
import { createRpcChannel } from '@/createRpcChannel'
import { IFrameClientAdapter } from '@/lib/adapter/iframe'
import { HostToIFrame, IFrameToHost } from './IFrameMessages'

onReady(() => {
    const log = createHtmlLogger(document.querySelector<HTMLUListElement>('#output')!)
    const channel = createRpcChannel<IFrameToHost, HostToIFrame>(new IFrameClientAdapter('example'))

    channel.addEventListener('ping', () => {
        log(MessageType.RECEIVED, 'ping')
    })

    channel.addEventListener('anyrpc::connection-change', (status) => {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        log(MessageType.INFO, `Connection status ${status}`)
    })

    document.querySelector('#send-pong')?.addEventListener('click', () => {
        log(MessageType.SENT, 'pong')
        void channel.pong()
    })

    document.querySelector('#send-size')?.addEventListener('click', () => {
        log(MessageType.SENT, 'size', window.innerWidth, window.innerHeight)
        void channel.size(window.innerWidth, window.innerHeight)
    })
})
