import { onReady } from '../__helper/onReady'
import { createHtmlLogger, MessageType } from '../__helper/createHtmlLogger'
import { createRpcChannel } from '@/createRpcChannel'
import { IFrameClientAdapter } from '@/lib/adapter/iframe'
import type { HostToIFrame, IFrameToHost } from './IFrameMessages'

onReady(() => {
    const log = createHtmlLogger(document.querySelector<HTMLUListElement>('#output')!)
    const channel = createRpcChannel<IFrameToHost, HostToIFrame>(new IFrameClientAdapter('example'))

    channel.$.handle('ping', () => {
        log(MessageType.RECEIVED, 'ping')
    })

    channel.$.on('rpc.status', (status) => {
        log(MessageType.INFO, `Connection status ${status}`)
    })

    document.querySelector('#send-pong')?.addEventListener('click', () => {
        log(MessageType.SENT, 'pong')
        void channel.pong()
    })

    document.querySelector('#send-size')?.addEventListener('click', () => {
        log(MessageType.SENT, 'size (notification)', window.innerWidth, window.innerHeight)
        channel.size.notify(window.innerWidth, window.innerHeight)
    })
})
