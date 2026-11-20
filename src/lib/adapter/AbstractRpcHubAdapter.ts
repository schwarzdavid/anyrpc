import type { Promisable } from '@/types/Promisable'
import type { MethodMap } from '@/types/MethodMap'
import type { LogLevel } from '@/types/LogLevel'
import type { AbstractRpcAdapter } from '@/lib/adapter/AbstractRpcAdapter'
import { Logger } from '@/lib/Logger'
import { uuid } from '@/utils/uuid'

export interface RpcPeerConnection<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Context = undefined,
> {
    readonly id: string
    readonly adapter: AbstractRpcAdapter<Methods, Events>
    readonly context: Context
}

export type PeerHandler<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>, Context = undefined> = (
    connection: RpcPeerConnection<Methods, Events, Context>,
) => void

export type PeerLostHandler = (id: string) => void

export interface RpcHubAdapterBinding<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    in out Context = undefined,
> {
    onPeer: PeerHandler<Methods, Events, Context>
    onPeerLost: PeerLostHandler
    logLevel: LogLevel
}

export type RpcPeerContextArgument<Context> = undefined extends Context ? [context?: Context] : [context: Context]

export abstract class AbstractRpcHubAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    in out Context = undefined,
> {
    private binding: RpcHubAdapterBinding<Methods, Events, Context> | undefined
    protected readonly logName: string = 'RpcHubAdapter'
    protected logger?: Logger

    bind(binding: RpcHubAdapterBinding<Methods, Events, Context>): void {
        this.binding = binding
        this.logger = new Logger(this.logName, binding.logLevel)
    }

    abstract connect(): Promisable<void>

    protected addPeer(
        adapter: AbstractRpcAdapter<Methods, Events>,
        ...[context]: RpcPeerContextArgument<Context>
    ): string {
        const connection = { id: uuid(), adapter, context: context as Context }
        this.binding?.onPeer(connection)
        return connection.id
    }

    protected removePeer(id: string): void {
        this.binding?.onPeerLost(id)
    }

    abstract destroy(): void
}
