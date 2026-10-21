import { createHash } from 'node:crypto'
import { createRpcChannel } from '@schwarzdavid/anyrpc'
import { ChildProcessClientAdapter } from '@schwarzdavid/anyrpc/adapters/child-process'
import type { ChildToParent, ParentToChild } from './ChildProcessMessages'

const channel = createRpcChannel<ChildToParent, ParentToChild>(new ChildProcessClientAdapter('example'))

channel.$.handle('hash', (text) => {
    channel.log.notify(`hashing ${String(text.length)} characters`)
    return createHash('sha256').update(text).digest('hex')
})
