import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRpcChannel } from 'anyrpc'
import { ChildProcessHostAdapter } from 'anyrpc/adapters/child-process'
import type { ChildToParent, ParentToChild } from './ChildProcessMessages'

const child = fork(fileURLToPath(new URL('./child.ts', import.meta.url)))
const channel = createRpcChannel<ParentToChild, ChildToParent>(
    new ChildProcessHostAdapter(child, 'example', { killOnDestroy: true }),
    { queueEnabled: true },
)

channel.$.on('log', (message) => {
    console.log(`[child] ${message}`)
})

console.log(`sha256("anyrpc") = ${await channel.hash('anyrpc')}`)
channel.$.destroy()
