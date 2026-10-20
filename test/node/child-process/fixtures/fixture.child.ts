import { setTimeout } from 'node:timers/promises'
import { createRpcChannel, type RpcChannel } from 'anyrpc'
import { ChildProcessClientAdapter } from 'anyrpc/adapters/child-process'
import type { ChildToParent, ParentToChild } from './FixtureMessages'

process.send?.({ type: 'unrelated message before anyrpc starts' })
await setTimeout(1500)

let channel: RpcChannel<ChildToParent, ParentToChild>
let generation = 0

function startChannel(): void {
    generation += 1
    channel = createRpcChannel<ChildToParent, ParentToChild>(new ChildProcessClientAdapter('e2e'))
    channel.$.handle('add', (a, b) => a + b)
    channel.$.handle('askForGreeting', (name) => channel.greet(name))
    channel.$.handle('exit', (code) => process.exit(code))
    channel.$.handle('shutdown', () => {
        void setTimeout(10).then(() => channel.$.destroy())
    })
    channel.$.handle('recreateChannel', () => {
        void setTimeout(10).then(() => {
            channel.$.destroy()
            startChannel()
        })
        return generation
    })
    channel.$.handle('generation', () => generation)
}

startChannel()
