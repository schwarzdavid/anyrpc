import { setTimeout } from 'node:timers/promises'
import { createRpcChannel } from 'anyrpc'
import { ChildProcessClientAdapter } from 'anyrpc/adapters/child-process'
import type { ChildToParent, ParentToChild } from './FixtureMessages'

process.send?.({ type: 'unrelated message before anyrpc starts' })
await setTimeout(1500)

const channel = createRpcChannel<ChildToParent, ParentToChild>(new ChildProcessClientAdapter('e2e'))

channel.$.handle('add', (a, b) => a + b)
channel.$.handle('askForGreeting', (name) => channel.greet(name))
channel.$.handle('exit', (code) => process.exit(code))
