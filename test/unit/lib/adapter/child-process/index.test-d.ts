import { describe, expectTypeOf, it } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import {
    ChildProcessClientAdapter,
    ChildProcessHostAdapter,
    type ChildProcessHostAdapterOptions,
    type ChildProcessLike,
} from '@/lib/adapter/child-process'
import type { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import type { HeartbeatOption } from '@/lib/Heartbeat'
import type { IpcProcess, ProcessLike } from '@/lib/adapter/child-process/utils/currentProcess'

interface Methods {
    ping(): string
}

describe('anyrpc/adapters/child-process entry point', () => {
    it('should accept a forked child process and the global process', () => {
        expectTypeOf<ChildProcess>().toExtend<ChildProcessLike>()
        expectTypeOf<NodeJS.Process>().toExtend<ProcessLike>()
        expectTypeOf<NonNullable<NodeJS.Process['send']>>().toExtend<IpcProcess['send']>()
    })

    it('should create adapters for both sides', () => {
        expectTypeOf<ChildProcessHostAdapter<Methods, Methods>>().toExtend<AbstractRpcAdapter<Methods, Methods>>()
        expectTypeOf<ChildProcessClientAdapter<Methods, Methods>>().toExtend<AbstractRpcAdapter<Methods, Methods>>()
    })

    it('should expose the host options', () => {
        expectTypeOf<ChildProcessHostAdapterOptions>().toEqualTypeOf<{
            pollingInterval: number
            heartbeat: HeartbeatOption
            killOnDestroy: boolean
        }>()
    })
})
