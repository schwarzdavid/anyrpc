import { assertType, describe, expectTypeOf, it } from 'vitest'
import { createRpcChannel } from '@/createRpcChannel'
import { IFrameHostAdapter } from '@/lib/adapter/iframe'

interface HostToIFrame {
    compute(input: number): number
}

interface IFrameToHost {
    progress(percent: number): void
}

declare const iframe: HTMLIFrameElement

describe(IFrameHostAdapter, () => {
    it('should accept an iframe without further configuration', () => {
        expectTypeOf(new IFrameHostAdapter<HostToIFrame, IFrameToHost>(iframe)).toBeObject()
    })

    it('should accept a name and options', () => {
        expectTypeOf(
            new IFrameHostAdapter<HostToIFrame, IFrameToHost>(iframe, 'my-app', {
                postMessageOrigin: 'https://example.com',
                reconnect: false,
                heartbeat: { interval: 1000 },
            }),
        ).toBeObject()
        expectTypeOf(new IFrameHostAdapter(iframe, 'my-app', { heartbeat: true })).toBeObject()
        expectTypeOf(
            new IFrameHostAdapter(iframe, 'my-app', { origin: ['https://example.com', /\.example\.com$/u] }),
        ).toBeObject()
        expectTypeOf(
            new IFrameHostAdapter(iframe, 'my-app', { origin: (origin: string) => origin.length > 0 }),
        ).toBeObject()
    })

    it('should reject invalid options', () => {
        // @ts-expect-error
        assertType(new IFrameHostAdapter(iframe, 'my-app', { heartbeat: { interval: '1000' } }))
        // @ts-expect-error
        assertType(new IFrameHostAdapter(iframe, 'my-app', { origin: [(origin: string) => origin.length > 0] }))
        // @ts-expect-error
        assertType(new IFrameHostAdapter(iframe, 'my-app', { pollingInterval: 100 }))
    })

    it('should infer the channel methods', () => {
        const channel = createRpcChannel(new IFrameHostAdapter<HostToIFrame, IFrameToHost>(iframe))

        expectTypeOf(channel.compute).parameters.toEqualTypeOf<[input: number]>()
        expectTypeOf(channel.compute(1)).resolves.toEqualTypeOf<number>()
    })
})
