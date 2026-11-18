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

export interface RpcHubAdapterBinding<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    onPeer: PeerHandler<Methods, Events>
    onPeerLost: PeerLostHandler
    logLevel: LogLevel
}

export abstract class AbstractRpcHubAdapter<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>> {
    private binding: RpcHubAdapterBinding<Methods, Events> | undefined
    protected readonly logName: string = 'RpcHubAdapter'
    protected logger?: Logger

    bind(binding: RpcHubAdapterBinding<Methods, Events>): void {
        this.binding = binding
        this.logger = new Logger(this.logName, binding.logLevel)
    }

    abstract connect(): Promisable<void>

    protected addPeer(adapter: AbstractRpcAdapter<Methods, Events>): string {
        const id = uuid()
        this.binding?.onPeer({ id, adapter })
        return id
    }

    protected removePeer(id: string): void {
        this.binding?.onPeerLost(id)
    }

    abstract destroy(): void
}
