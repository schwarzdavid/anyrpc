import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { currentProcess, hasIpcChannel } from '@/lib/adapter/child-process/utils/currentProcess'

class ProcessWithoutIpc extends EventEmitter {
    readonly connected = false
}

describe(currentProcess, () => {
    it('should return the global process', () => {
        expect(currentProcess()).toBe(process)
    })
})

describe(hasIpcChannel, () => {
    it('should detect a process with an IPC channel', () => {
        const ipcProcess = Object.assign(new ProcessWithoutIpc(), { send: () => true })

        expect(hasIpcChannel(ipcProcess)).toBe(true)
    })

    it('should detect a process without an IPC channel', () => {
        expect(hasIpcChannel(new ProcessWithoutIpc())).toBe(false)
    })
})
