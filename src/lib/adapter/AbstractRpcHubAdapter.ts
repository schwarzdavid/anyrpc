import type { Promisable } from 'type-fest'
import type { MethodMap } from '@/types/MethodMap'
import type { LogLevel } from '@/types/LogLevel'
import type { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import { Logger } from '@/lib/Logger'
import { uuid } from '@/utils/uuid'

export interface RpcPeerConnection<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    readonly id: string
    readonly adapter: AbstractRpcAdapter<Methods, Events>
}

export type PeerHandler<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> = (
    connection: RpcPeerConnection<Methods, Events>,
) => void

export type PeerLostHandler = (id: string) => void

export abstract class AbstractRpcHubAdapter<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    private _peerHandler?: PeerHandler<Methods, Events>
    private _peerLostHandler?: PeerLostHandler
    protected logger?: Logger

    set peerHandler(handler: PeerHandler<Methods, Events>) {
        this._peerHandler = handler
    }

    set peerLostHandler(handler: PeerLostHandler) {
        this._peerLostHandler = handler
    }

    abstract connect(): Promisable<void>

    protected addPeer(adapter: AbstractRpcAdapter<Methods, Events>): string {
        const id = uuid()
        this._peerHandler?.({ id, adapter })
        return id
    }

    protected removePeer(id: string): void {
        this._peerLostHandler?.(id)
    }

    initLogger(logLevel: LogLevel): void {
        this.logger = new Logger(this.constructor.name, logLevel)
    }

    abstract destroy(): void
}
