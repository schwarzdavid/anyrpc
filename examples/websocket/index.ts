import { onReady } from '../__helper/onReady'
import { createHtmlLogger, MessageType } from '../__helper/createHtmlLogger'
import { createRpcChannel } from '@/createRpcChannel'
import { WebSocketClientAdapter } from '@/lib/adapter/websocket'
import type { ClientToServer, ServerToClient } from './WebSocketMessages'

onReady(() => {
    const log = createHtmlLogger(document.querySelector<HTMLUListElement>('#output')!)
    const form = document.querySelector<HTMLFormElement>('#chat')!
    const channel = createRpcChannel<ClientToServer, ServerToClient>(
        new WebSocketClientAdapter('ws://localhost:8081', { heartbeat: true }),
        { queueEnabled: true },
    )

    channel.$.on('rpc.status', (status) => {
        log(MessageType.INFO, `Connection status ${status}`)
    })

    channel.$.on('chatMessage', (text) => {
        log(MessageType.RECEIVED, 'chatMessage (notification)', text)
    })

    form.addEventListener('submit', (event) => {
        event.preventDefault()
        const input = form.elements.namedItem('text') as HTMLInputElement
        log(MessageType.SENT, 'sendChat (notification)', input.value)
        channel.sendChat.notify(input.value)
        input.value = ''
    })
})
