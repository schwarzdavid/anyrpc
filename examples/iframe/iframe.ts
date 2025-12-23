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

    document.querySelector('#send-pong')?.addEventListener('click', () => {
        log(MessageType.SENT, 'pong')
        void channel.pong()
    })
})
