import { assertType, describe, expectTypeOf, it } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { IFrameClientAdapter } from '@/lib/adapter/iframe'

interface HostToIFrame {
    compute(input: number): number
}

interface IFrameToHost {
    progress(percent: number): void
}

describe(IFrameClientAdapter, () => {
    it('should work without any arguments', () => {
        expectTypeOf(new IFrameClientAdapter<IFrameToHost, HostToIFrame>()).toBeObject()
    })

    it('should accept a name and options', () => {
        expectTypeOf(
            new IFrameClientAdapter('my-app', {
                postMessageOrigin: 'https://example.com',
                pollingInterval: 100,
                origin: ['https://example.com', /\.example\.com$/u],
            }),
        ).toBeObject()
        expectTypeOf(new IFrameClientAdapter('my-app', { origin: (origin: string) => origin.length > 0 })).toBeObject()
        expectTypeOf(new IFrameClientAdapter('my-app', { origin: true })).toBeObject()
    })

    it('should reject functions inside the origin array', () => {
        // @ts-expect-error
        assertType(new IFrameClientAdapter('my-app', { origin: [(origin: string) => origin.length > 0] }))
    })

    it('should reject host options', () => {
        // @ts-expect-error
        assertType(new IFrameClientAdapter('my-app', { heartbeat: true }))
        // @ts-expect-error
        assertType(new IFrameClientAdapter('my-app', { reconnect: false }))
    })

    it('should infer the channel methods', () => {
        const channel = createRpcChannel(new IFrameClientAdapter<IFrameToHost, HostToIFrame>())

        expectTypeOf(channel.progress.notify).parameters.toEqualTypeOf<[percent: number]>()
        expectTypeOf(channel.$.handle).toBeFunction()
    })
})
