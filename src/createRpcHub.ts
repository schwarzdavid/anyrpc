import { createRpcChannel, type RpcChannelOptions } from './createRpcChannel'
import type { AbstractRpcHubAdapter, RpcPeerConnection } from './lib/adapter/AbstractRpcHubAdapter'
import type { AbstractRpcAdapter } from './lib/adapter/AbstractRpcAdapter'
import { EventEmitter } from './lib/EventEmitter'
import { HandlerRegistry } from './lib/HandlerRegistry'
import { Logger } from './lib/Logger'
import { RpcError } from './lib/RpcError'
import { RpcErrorCode } from './constants/JSON_RPC_ERRORS'
import { assertNotReserved, isReservedMethodName } from './utils/rpc'
import { ConnectionStatus } from './types/ConnectionStatus'
import { LogLevel } from './types/LogLevel'
import type { MethodFn, MethodMap } from './types/MethodMap'
import type { AssertCallableMethodNames } from './types/MethodName'
import type { RpcHandler, RpcListener, Unsubscribe } from './types/EventEmitter'
import { createMethodProxy } from './utils/createMethodProxy'
import type { RpcHub, RpcHubEvents, RpcHubMeta, RpcPeer, RpcPeerPromise } from './types/RpcHub'
import type { RpcHandleableName } from './types/RpcChannel'

type PeerSubscription<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> = (
    peer: RpcPeer<Methods, Events>,
) => Unsubscribe

interface PeerEntry<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    readonly peer: RpcPeer<Methods, Events>
    readonly detachments: Map<PeerSubscription<Methods, Events>, Unsubscribe>
    joined: boolean
}

type UntypedRemoteMethod = ((...params: unknown[]) => Promise<unknown>) & {
    notify(...params: unknown[]): void
}

const boundHubAdapters = new WeakSet<object>()

export function createRpcHub<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>>(
    hubAdapter: AbstractRpcHubAdapter<Methods, Events> & AssertCallableMethodNames<Methods, Events>,
    options: Partial<RpcChannelOptions> = {},
): RpcHub<Methods, Events> {
    if (boundHubAdapters.has(hubAdapter)) {
        throw new Error(
            'The hub adapter is already used by another hub. Create a separate hub adapter instance for each hub.',
        )
    }
    boundHubAdapters.add(hubAdapter)

    const logLevel = options.logLevel ?? LogLevel.INFO
    const logger = new Logger('RpcHub', logLevel)
    const hubEvents = new EventEmitter<RpcHubEvents<Methods, Events>>((error, name) => {
        logger.error(`Listener for "${name}" threw an error`, error)
    })
    const handlers = new HandlerRegistry<Record<PropertyKey, MethodFn>>()
    const entries = new Map<string, PeerEntry<Methods, Events>>()
    const subscriptions = new Set<PeerSubscription<Methods, Events>>()
    let isDestroyed = false

    hubAdapter.initLogger(logLevel)
    hubAdapter.peerHandler = (connection) => void addPeer(connection)
    hubAdapter.peerLostHandler = removePeer

    if (options.autoConnect ?? true) {
        void connectHub()
    }

    async function connectHub(): Promise<void> {
        try {
            await hubAdapter.connect()
        } catch (error) {
            logger.error('The hub adapter could not connect', error)
        }
    }

    async function addPeer({ id, adapter }: RpcPeerConnection<Methods, Events>): Promise<void> {
        if (isDestroyed) {
            logger.warn(`Rejected peer "${id}": the hub was destroyed`)
            adapter.destroy()
            return
        }
        const channel = createRpcChannel<Methods, Events>(
            adapter as AbstractRpcAdapter<Methods, Events> & AssertCallableMethodNames<Methods, Events>,
            { ...options, autoConnect: false },
        )
        const entry: PeerEntry<Methods, Events> = { peer: { id, channel }, detachments: new Map(), joined: false }

        entries.set(id, entry)
        subscriptions.forEach((subscription) => attach(entry, subscription))
        channel.$.on('rpc.connected', () => join(entry))

        await connectPeer(adapter)
        if (channel.$.status === ConnectionStatus.CONNECTED) {
            join(entry)
        }
    }

    async function connectPeer(adapter: AbstractRpcAdapter<Methods, Events>): Promise<void> {
        try {
            await adapter.connect()
        } catch (error) {
            logger.error('A peer adapter could not connect', error)
        }
    }

    function join(entry: PeerEntry<Methods, Events>): void {
        if (entry.joined) {
            return
        }
        entry.joined = true
        logger.debug(`Peer "${entry.peer.id}" connected`)
        hubEvents.emit('rpc.peer.connected', [entry.peer])
    }

    function removePeer(id: string): void {
        const entry = entries.get(id)
        if (!entry) {
            return
        }
        entries.delete(id)
        entry.peer.channel.$.destroy()

        if (entry.joined) {
            logger.debug(`Peer "${id}" disconnected`)
            hubEvents.emit('rpc.peer.disconnected', [entry.peer])
        }
    }

    function joinedPeers(): RpcPeer<Methods, Events>[] {
        return [...entries.values()].filter((entry) => entry.joined).map((entry) => entry.peer)
    }

    function attach(entry: PeerEntry<Methods, Events>, subscription: PeerSubscription<Methods, Events>): void {
        entry.detachments.set(subscription, subscription(entry.peer))
    }

    function subscribe(subscription: PeerSubscription<Methods, Events>): Unsubscribe {
        subscriptions.add(subscription)
        entries.forEach((entry) => attach(entry, subscription))

        return () => {
            subscriptions.delete(subscription)
            entries.forEach((entry) => {
                entry.detachments.get(subscription)?.()
                entry.detachments.delete(subscription)
            })
        }
    }

    function assertNotDestroyed(): void {
        if (isDestroyed) {
            throw new RpcError({ code: RpcErrorCode.NOT_CONNECTED, message: 'The hub was destroyed' })
        }
    }

    function remoteMethodOf(peer: RpcPeer<Methods, Events>, method: string): UntypedRemoteMethod {
        return Reflect.get(peer.channel as object, method) as UntypedRemoteMethod
    }

    function callPeer(peer: RpcPeer<Methods, Events>, method: string, params: unknown[]): Promise<unknown> {
        try {
            return remoteMethodOf(peer, method)(...params)
        } catch (error) {
            return Promise.reject(error as Error)
        }
    }

    function createPeerPromise(
        peer: RpcPeer<Methods, Events>,
        method: string,
        params: unknown[],
    ): RpcPeerPromise<Methods, Events, unknown> {
        const promise = callPeer(peer, method, params)

        promise.catch((error: unknown) => {
            logger.debug(`Broadcast of "${method}" to peer "${peer.id}" failed`, error)
        })
        return Object.assign(promise, { peer })
    }

    function notifyPeer(peer: RpcPeer<Methods, Events>, method: string, params: unknown[]): void {
        try {
            remoteMethodOf(peer, method).notify(...params)
        } catch (error) {
            logger.warn(`Could not notify peer "${peer.id}" of "${method}"`, error)
        }
    }

    function createBroadcastMethod(method: string) {
        const call = (...params: unknown[]) => {
            assertNotReserved(method, 'call')
            assertNotDestroyed()
            return joinedPeers().map((peer) => createPeerPromise(peer, method, params))
        }
        const notify = (...params: unknown[]) => {
            assertNotReserved(method, 'notify')
            assertNotDestroyed()
            joinedPeers().forEach((peer) => notifyPeer(peer, method, params))
        }
        return Object.assign(call, { notify })
    }

    const meta: RpcHubMeta<Methods, Events> = {
        get peers() {
            return joinedPeers()
        },
        peer(id) {
            const entry = entries.get(id)
            return entry?.joined ? entry.peer : undefined
        },
        handle(name, handler) {
            assertNotReserved(name, 'handle')
            const untypedHandler = handler as (...params: unknown[]) => unknown
            const unregister = handlers.register(name, handler as MethodFn)
            const unsubscribe = subscribe((peer) =>
                peer.channel.$.handle(name, ((...params: unknown[]) =>
                    untypedHandler({ peer }, ...params)) as RpcHandler<Events[typeof name]>),
            )
            return () => {
                unsubscribe()
                unregister()
            }
        },
        on(name: PropertyKey, listener: RpcListener<MethodFn>): Unsubscribe {
            if (isReservedMethodName(name)) {
                return hubEvents.on(name as keyof RpcHubEvents<Methods, Events>, listener)
            }
            return subscribe((peer) =>
                peer.channel.$.on(name as RpcHandleableName<Events>, (...params) => listener({ peer }, ...params)),
            )
        },
        destroy() {
            if (isDestroyed) {
                return
            }
            isDestroyed = true
            boundHubAdapters.delete(hubAdapter)
            for (const id of [...entries.keys()]) {
                removePeer(id)
            }
            hubAdapter.destroy()
        },
    }

    return createMethodProxy(meta, createBroadcastMethod) as RpcHub<Methods, Events>
}
