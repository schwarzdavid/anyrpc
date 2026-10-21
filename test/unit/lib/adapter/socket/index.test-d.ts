import { describe, expectTypeOf, it } from 'vitest'
import { AbstractSocketAdapter, type HeartbeatOptions } from '@/lib/adapter/socket'
import type { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'

interface Methods {
    ping(): string
}

declare const transport: { write(data: string): void }

describe('@schwarzdavid/anyrpc/adapters/socket entry point', () => {
    it('should let consumers write a single-channel adapter by implementing send and connect', () => {
        class LineAdapter extends AbstractSocketAdapter<Methods, Methods> {
            constructor(heartbeat: HeartbeatOptions = { interval: 1000, timeout: 3000 }) {
                super(heartbeat)
            }

            connect(): void {
                this.opened()
            }

            protected send(message: object): void {
                transport.write(JSON.stringify(message))
            }

            handleLine(line: string): void {
                this.receive(line)
            }
        }

        expectTypeOf(new LineAdapter()).toExtend<AbstractRpcAdapter<Methods, Methods>>()
    })
})
