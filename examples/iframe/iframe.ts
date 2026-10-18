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

    async function sendPong(): Promise<void> {
        log(MessageType.SENT, 'pong')
        try {
            await channel.pong()
            log(MessageType.RECEIVED, 'pong answered')
        } catch (error) {
            log(MessageType.INFO, 'pong failed', String(error))
        }
    }

    function sendSize(): void {
        log(MessageType.SENT, 'size (notification)', window.innerWidth, window.innerHeight)
        try {
            channel.size.notify(window.innerWidth, window.innerHeight)
        } catch (error) {
            log(MessageType.INFO, 'size failed', String(error))
        }
    }

    document.querySelector('#send-pong')?.addEventListener('click', () => void sendPong())

    document.querySelector('#send-size')?.addEventListener('click', sendSize)
})
