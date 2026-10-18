import { createRpcChannel } from '@/createRpcChannel'
import { IFrameClientAdapter } from '@/lib/adapter/iframe'
import { RpcError } from '@/lib/RpcError'
import { LogLevel } from '@/types/LogLevel'
import type { HostToIFrame, IFrameToHost } from './FixtureMessages'

const query = new URLSearchParams(window.location.search)
const origin = query.get('origin')
const postMessageOrigin = query.get('postMessageOrigin')

const channel = createRpcChannel<IFrameToHost, HostToIFrame>(
    new IFrameClientAdapter('fixture', {
        pollingInterval: 50,
        ...(origin === null ? {} : { origin }),
        ...(postMessageOrigin === null ? {} : { postMessageOrigin }),
    }),
    { logLevel: LogLevel.NONE },
)

channel.$.handle('echo', (value) => value)
channel.$.handle('askHost', (name) => channel.greet(name))
channel.$.handle('wait', (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
channel.$.handle('fail', (message) => {
    throw new Error(message)
})
channel.$.handle('failWithCode', (code, message) => {
    throw new RpcError({ code, message })
})
channel.$.handle('unclonable', () => () => undefined)
channel.$.handle('report', (value) => {
    channel.reported.notify(`reported: ${value}`)
})
channel.$.handle('destroyChannel', () => {
    setTimeout(() => channel.$.destroy())
})
