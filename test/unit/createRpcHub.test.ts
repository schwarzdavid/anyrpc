import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRpcHub } from '@/createRpcHub'
import { createRpcChannel } from '@/createRpcChannel'
import { AbstractRpcHubAdapter } from '@/lib/adapter/AbstractRpcHubAdapter'
import { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import { RpcError } from '@/lib/RpcError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import type { MethodMap } from '@/types/MethodMap'
import type { RpcMessage } from '@/types/RpcMessages'
import type { RpcChannel } from '@/types/RpcChannel'
import type { RpcCallContext, RpcHubHandler, RpcPeer } from '@/types/RpcHub'

type TestHubPeer = RpcPeer<HubToPeer, PeerToHub>

interface HubToPeer {
    getName(): string
    refresh(): void
}

interface PeerToHub {
    getState(key: string): string
    report(value: number): void
}

class LoopbackAdapter<M extends MethodMap<M>, E extends MethodMap<E>> extends AbstractRpcAdapter<M, E> {
    remote: LoopbackAdapter<E, M> | undefined

    connect = vi.fn<() => void | Promise<void>>(() => {
        this.connectionStatus = ConnectionStatus.CONNECTED
    })

    sendMessage(message: RpcMessage<M, E>): void {
        void this.remote?.receive(structuredClone(message))
    }

    receive(message: object): Promise<void> {
        return this.onMessage(message)
    }

    setStatus(status: ConnectionStatus): void {
        this.connectionStatus = status
    }
}

class TestHubAdapter extends AbstractRpcHubAdapter<HubToPeer, PeerToHub> {
    connect = vi.fn<() => void | Promise<void>>()
    destroy = vi.fn<() => void>()

    join(adapter: AbstractRpcAdapter<HubToPeer, PeerToHub>): string {
        return this.addPeer(adapter)
    }

    leave(id: string): void {
        this.removePeer(id)
    }
}

interface TestPeer {
    id: string
    hubSide: LoopbackAdapter<HubToPeer, PeerToHub>
    client: RpcChannel<PeerToHub, HubToPeer>
}

function connectPeer(hubAdapter: TestHubAdapter, name: string, getName: () => string = () => name): TestPeer {
    const hubSide = new LoopbackAdapter<HubToPeer, PeerToHub>()
    const clientSide = new LoopbackAdapter<PeerToHub, HubToPeer>()
    hubSide.remote = clientSide
    clientSide.remote = hubSide

    const client = createRpcChannel<PeerToHub, HubToPeer>(clientSide)
    client.$.handle('getName', getName)

    return { id: hubAdapter.join(hubSide), hubSide, client }
}

async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve))
}

describe(createRpcHub, () => {
    let hubAdapter: TestHubAdapter

    beforeEach(() => {
        hubAdapter = new TestHubAdapter()
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('hub adapter', () => {
        it('should connect the hub adapter automatically', () => {
            createRpcHub(hubAdapter)

            expect(hubAdapter.connect).toHaveBeenCalledTimes(1)
        })

        it('should not connect the hub adapter if autoConnect is disabled', () => {
            createRpcHub(hubAdapter, { autoConnect: false })

            expect(hubAdapter.connect).not.toHaveBeenCalled()
        })

        it('should log an error if the hub adapter cannot connect', async () => {
            hubAdapter.connect.mockRejectedValueOnce(new Error('boom'))

            createRpcHub(hubAdapter)
            await flush()

            expect(console.error).toHaveBeenCalledWith(
                '[RpcHub]',
                'The hub adapter could not connect',
                new Error('boom'),
            )
        })

        it('should initialize the logger of the hub adapter with the configured log level', () => {
            const initLogger = vi.spyOn(hubAdapter, 'initLogger')

            createRpcHub(hubAdapter, { logLevel: LogLevel.WARN })

            expect(initLogger).toHaveBeenCalledExactlyOnceWith(LogLevel.WARN)
        })

        it('should refuse a hub adapter that is already used by another hub', () => {
            createRpcHub(hubAdapter)

            expect(() => createRpcHub(hubAdapter)).toThrowError(
                'The hub adapter is already used by another hub. Create a separate hub adapter instance for each hub.',
            )
        })

        it('should allow reusing the hub adapter once the hub was destroyed', () => {
            createRpcHub(hubAdapter).$.destroy()

            expect(() => createRpcHub(hubAdapter)).not.toThrowError()
        })
    })

    describe('peers', () => {
        it('should announce a peer once its channel is connected', () => {
            const hub = createRpcHub(hubAdapter)
            const connected = vi.fn<(peer: TestHubPeer) => void>()
            hub.$.on('rpc.peer.connected', connected)

            const { id, hubSide } = connectPeer(hubAdapter, 'first')

            expect(hubSide.connect).toHaveBeenCalledTimes(1)
            expect(connected).toHaveBeenCalledExactlyOnceWith(hub.$.peer(id))
            expect(hub.$.peers.map((peer) => peer.id)).toStrictEqual([id])
        })

        it('should apply the channel options to every peer channel', async () => {
            const hub = createRpcHub(hubAdapter, { timeout: 50 })
            const { id, hubSide } = connectPeer(hubAdapter, 'first')
            hubSide.remote = undefined

            await expect(hub.$.peer(id)?.channel.getName()).rejects.toStrictEqual(
                new RpcError(RpcErrorCode.TIMEOUT_ERROR),
            )
        })

        it('should keep a peer hidden until its channel is connected', () => {
            const hub = createRpcHub(hubAdapter)
            const connected = vi.fn<(peer: TestHubPeer) => void>()
            const hubSide = new LoopbackAdapter<HubToPeer, PeerToHub>()
            hubSide.connect.mockImplementation(() => undefined)
            hub.$.on('rpc.peer.connected', connected)

            const id = hubAdapter.join(hubSide)

            expect(hub.$.peers).toStrictEqual([])
            expect(hub.$.peer(id)).toBeUndefined()
            expect(connected).not.toHaveBeenCalled()

            hubSide.setStatus(ConnectionStatus.CONNECTED)

            expect(hub.$.peer(id)?.id).toBe(id)
            expect(connected).toHaveBeenCalledTimes(1)
        })

        it('should announce a peer whose adapter is connected before it is handed to the hub', async () => {
            const hub = createRpcHub(hubAdapter)
            const connected = vi.fn<(peer: TestHubPeer) => void>()
            const hubSide = new LoopbackAdapter<HubToPeer, PeerToHub>()
            hubSide.setStatus(ConnectionStatus.CONNECTED)
            hub.$.on('rpc.peer.connected', connected)

            const id = hubAdapter.join(hubSide)
            await flush()

            expect(connected).toHaveBeenCalledExactlyOnceWith(hub.$.peer(id))
        })

        it('should log an error and keep the peer hidden if its adapter cannot connect', async () => {
            const hub = createRpcHub(hubAdapter)
            const hubSide = new LoopbackAdapter<HubToPeer, PeerToHub>()
            hubSide.connect.mockRejectedValueOnce(new Error('boom'))

            hubAdapter.join(hubSide)
            await flush()

            expect(hub.$.peers).toStrictEqual([])
            expect(console.error).toHaveBeenCalledWith(
                '[RpcHub]',
                'A peer adapter could not connect',
                new Error('boom'),
            )
        })

        it('should announce a peer only once even if its connection recovers', () => {
            const hub = createRpcHub(hubAdapter)
            const connected = vi.fn<(peer: TestHubPeer) => void>()
            const disconnected = vi.fn<(peer: TestHubPeer) => void>()
            hub.$.on('rpc.peer.connected', connected)
            hub.$.on('rpc.peer.disconnected', disconnected)
            const { hubSide } = connectPeer(hubAdapter, 'first')

            hubSide.setStatus(ConnectionStatus.DISCONNECTED)
            hubSide.setStatus(ConnectionStatus.CONNECTED)

            expect(connected).toHaveBeenCalledTimes(1)
            expect(disconnected).not.toHaveBeenCalled()
            expect(hub.$.peers).toHaveLength(1)
        })

        it('should remove a lost peer, announce it and reject its pending calls', async () => {
            const hub = createRpcHub(hubAdapter)
            const disconnected = vi.fn<(peer: TestHubPeer) => void>()
            hub.$.on('rpc.peer.disconnected', disconnected)
            const { id, hubSide } = connectPeer(hubAdapter, 'first')
            const peer = hub.$.peer(id)
            hubSide.remote = undefined
            const pendingCall = peer?.channel.getName()

            hubAdapter.leave(id)

            await expect(pendingCall).rejects.toStrictEqual(new RpcError(RpcErrorCode.CONNECTION_LOST))
            expect(disconnected).toHaveBeenCalledExactlyOnceWith(peer)
            expect(hub.$.peers).toStrictEqual([])
            expect(hub.$.peer(id)).toBeUndefined()
            expect(hubSide.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
        })

        it('should not announce the loss of a peer that never connected', () => {
            const hub = createRpcHub(hubAdapter)
            const disconnected = vi.fn<(peer: TestHubPeer) => void>()
            const hubSide = new LoopbackAdapter<HubToPeer, PeerToHub>()
            hubSide.connect.mockImplementation(() => undefined)
            hub.$.on('rpc.peer.disconnected', disconnected)

            hubAdapter.leave(hubAdapter.join(hubSide))

            expect(disconnected).not.toHaveBeenCalled()
        })

        it('should ignore the loss of an unknown peer', () => {
            const hub = createRpcHub(hubAdapter)
            const disconnected = vi.fn<(peer: TestHubPeer) => void>()
            hub.$.on('rpc.peer.disconnected', disconnected)

            hubAdapter.leave('unknown')

            expect(disconnected).not.toHaveBeenCalled()
        })

        it('should log errors thrown by hub event listeners', () => {
            const hub = createRpcHub(hubAdapter)
            hub.$.on('rpc.peer.connected', () => {
                throw new Error('listener failed')
            })

            connectPeer(hubAdapter, 'first')

            expect(console.error).toHaveBeenCalledWith(
                '[RpcHub]',
                'Listener for "rpc.peer.connected" threw an error',
                new Error('listener failed'),
            )
        })

        it('should stop notifying hub event listeners once they unsubscribed', () => {
            const hub = createRpcHub(hubAdapter)
            const connected = vi.fn<(peer: TestHubPeer) => void>()
            hub.$.on('rpc.peer.connected', connected)()

            connectPeer(hubAdapter, 'first')

            expect(connected).not.toHaveBeenCalled()
        })
    })

    describe('handlers', () => {
        it('should answer calls of every peer and pass the calling peer as context', async () => {
            const hub = createRpcHub(hubAdapter)
            const handler = vi.fn<RpcHubHandler<HubToPeer, PeerToHub, PeerToHub['getState']>>(
                (context, key) => `${context.peer.id}:${key}`,
            )
            hub.$.handle('getState', handler)
            const first = connectPeer(hubAdapter, 'first')
            const second = connectPeer(hubAdapter, 'second')

            await expect(first.client.getState('a')).resolves.toBe(`${first.id}:a`)
            await expect(second.client.getState('b')).resolves.toBe(`${second.id}:b`)
            expect(handler).toHaveBeenNthCalledWith(1, { peer: hub.$.peer(first.id) }, 'a')
        })

        it('should register handlers on peers that are already connected', async () => {
            const hub = createRpcHub(hubAdapter)
            const { client } = connectPeer(hubAdapter, 'first')

            hub.$.handle('getState', (_context, key) => key.toUpperCase())

            await expect(client.getState('a')).resolves.toBe('A')
        })

        it('should remove the handler from every peer when unsubscribing', async () => {
            const hub = createRpcHub(hubAdapter)
            const { client } = connectPeer(hubAdapter, 'first')
            const unsubscribe = hub.$.handle('getState', () => 'state')

            unsubscribe()

            await expect(client.getState('a')).rejects.toMatchObject({ code: RpcErrorCode.METHOD_NOT_FOUND })
            expect(() => hub.$.handle('getState', () => 'other')).not.toThrowError()
        })

        it('should refuse a second handler for the same method', () => {
            const hub = createRpcHub(hubAdapter)
            hub.$.handle('getState', () => 'state')

            expect(() => hub.$.handle('getState', () => 'other')).toThrowError(
                'A handler for "getState" is already registered. ' +
                    'Call the function returned by the previous handle() before registering a new handler.',
            )
        })

        it('should refuse to handle reserved rpc. methods', () => {
            const hub = createRpcHub(hubAdapter)

            expect(() => hub.$.handle('rpc.discover' as 'getState', () => 'state')).toThrowError(
                'Cannot handle "rpc.discover": method names starting with "rpc." are reserved by JSON-RPC 2.0',
            )
        })
    })

    describe('listeners', () => {
        it('should pass the calling peer and the params to listeners', () => {
            const hub = createRpcHub(hubAdapter)
            const listener = vi.fn<(context: RpcCallContext<HubToPeer, PeerToHub>, value: number) => void>()
            hub.$.on('report', listener)
            const { id, client } = connectPeer(hubAdapter, 'first')

            client.report.notify(42)

            expect(listener).toHaveBeenCalledExactlyOnceWith({ peer: hub.$.peer(id) }, 42)
        })

        it('should stop calling listeners once they unsubscribed', () => {
            const hub = createRpcHub(hubAdapter)
            const listener = vi.fn<(context: RpcCallContext<HubToPeer, PeerToHub>, value: number) => void>()
            const { client } = connectPeer(hubAdapter, 'first')

            hub.$.on('report', listener)()
            client.report.notify(42)
            connectPeer(hubAdapter, 'second').client.report.notify(43)

            expect(listener).not.toHaveBeenCalled()
        })
    })

    describe('broadcast', () => {
        it('should call every connected peer and return one promise per peer', async () => {
            const hub = createRpcHub(hubAdapter)
            const first = connectPeer(hubAdapter, 'first')
            const second = connectPeer(hubAdapter, 'second')

            const calls = hub.getName()

            expect(calls.map((call) => call.peer.id)).toStrictEqual([first.id, second.id])
            await expect(Promise.all(calls)).resolves.toStrictEqual(['first', 'second'])
        })

        it('should return an empty array if no peer is connected', () => {
            const hub = createRpcHub(hubAdapter)

            expect(hub.getName()).toStrictEqual([])
        })

        it('should only reject the promise of the peer that failed', async () => {
            const hub = createRpcHub(hubAdapter, { logLevel: LogLevel.DEBUG })
            connectPeer(hubAdapter, 'first')
            const failing = connectPeer(hubAdapter, 'second', () => {
                throw new Error('boom')
            })

            const [succeeding, rejecting] = hub.getName()

            await expect(succeeding).resolves.toBe('first')
            await expect(rejecting).rejects.toMatchObject({ code: RpcErrorCode.SERVER_ERROR })
            expect(console.log).toHaveBeenCalledWith(
                '[RpcHub]',
                `Broadcast of "getName" to peer "${failing.id}" failed`,
                expect.any(RpcError),
            )
        })

        it('should not cause unhandled rejections for promises nobody awaits', async () => {
            const hub = createRpcHub(hubAdapter)
            connectPeer(hubAdapter, 'first', () => {
                throw new Error('boom')
            })

            void hub.getName()
            await flush()

            expect(console.error).not.toHaveBeenCalled()
        })

        it('should reject the promise of a peer whose connection is interrupted instead of throwing', async () => {
            const hub = createRpcHub(hubAdapter)
            const { hubSide } = connectPeer(hubAdapter, 'first')
            hubSide.setStatus(ConnectionStatus.DISCONNECTED)

            const [call] = hub.getName()

            await expect(call).rejects.toStrictEqual(new RpcError(RpcErrorCode.NOT_CONNECTED))
        })

        it('should notify every connected peer', () => {
            const hub = createRpcHub(hubAdapter)
            const first = connectPeer(hubAdapter, 'first')
            const second = connectPeer(hubAdapter, 'second')
            const firstListener = vi.fn<() => void>()
            const secondListener = vi.fn<() => void>()
            first.client.$.on('refresh', firstListener)
            second.client.$.on('refresh', secondListener)

            hub.refresh.notify()

            expect(firstListener).toHaveBeenCalledTimes(1)
            expect(secondListener).toHaveBeenCalledTimes(1)
        })

        it('should keep notifying the other peers if one cannot be notified', () => {
            const hub = createRpcHub(hubAdapter)
            const first = connectPeer(hubAdapter, 'first')
            const second = connectPeer(hubAdapter, 'second')
            const secondListener = vi.fn<() => void>()
            second.client.$.on('refresh', secondListener)
            first.hubSide.setStatus(ConnectionStatus.DISCONNECTED)

            hub.refresh.notify()

            expect(secondListener).toHaveBeenCalledTimes(1)
            expect(console.warn).toHaveBeenCalledWith(
                '[RpcHub]',
                `Could not notify peer "${first.id}" of "refresh"`,
                new RpcError(RpcErrorCode.NOT_CONNECTED),
            )
        })

        it('should refuse to broadcast reserved rpc. methods', () => {
            const hub = createRpcHub(hubAdapter)
            const reserved = (hub as unknown as Record<string, typeof hub.refresh>)['rpc.discover']

            expect(() => reserved?.()).toThrowError(
                'Cannot call "rpc.discover": method names starting with "rpc." are reserved by JSON-RPC 2.0',
            )
            expect(() => reserved?.notify()).toThrowError(
                'Cannot notify "rpc.discover": method names starting with "rpc." are reserved by JSON-RPC 2.0',
            )
        })

        it('should not expose probed properties as broadcast methods', () => {
            const hub = createRpcHub(hubAdapter)
            const untypedHub = hub as unknown as Record<PropertyKey, unknown>

            expect(untypedHub.then).toBeUndefined()
            expect(untypedHub.toJSON).toBeUndefined()
            expect(untypedHub[Symbol.iterator]).toBeUndefined()
        })
    })

    describe('destroy', () => {
        it('should remove all peers, announce them and destroy the hub adapter', () => {
            const hub = createRpcHub(hubAdapter)
            const disconnected = vi.fn<(peer: TestHubPeer) => void>()
            hub.$.on('rpc.peer.disconnected', disconnected)
            const first = connectPeer(hubAdapter, 'first')
            const second = connectPeer(hubAdapter, 'second')

            hub.$.destroy()
            hub.$.destroy()

            expect(disconnected).toHaveBeenCalledTimes(2)
            expect(first.hubSide.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(second.hubSide.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)
            expect(hub.$.peers).toStrictEqual([])
            expect(hubAdapter.destroy).toHaveBeenCalledTimes(1)
        })

        it('should refuse to broadcast once the hub was destroyed', () => {
            const hub = createRpcHub(hubAdapter)
            const destroyedError = new RpcError({ code: RpcErrorCode.NOT_CONNECTED, message: 'The hub was destroyed' })

            hub.$.destroy()

            expect(() => hub.getName()).toThrowError(destroyedError)
            expect(() => hub.refresh.notify()).toThrowError(destroyedError)
        })

        it('should destroy peers that arrive after the hub was destroyed', () => {
            const hub = createRpcHub(hubAdapter)
            const hubSide = new LoopbackAdapter<HubToPeer, PeerToHub>()
            const destroy = vi.spyOn(hubSide, 'destroy')
            hub.$.destroy()

            const id = hubAdapter.join(hubSide)

            expect(destroy).toHaveBeenCalledTimes(1)
            expect(hubSide.connect).not.toHaveBeenCalled()
            expect(console.warn).toHaveBeenCalledWith('[RpcHub]', `Rejected peer "${id}": the hub was destroyed`)
        })
    })
})
