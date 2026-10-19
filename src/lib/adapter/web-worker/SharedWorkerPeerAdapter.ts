import type { MethodMap } from '@/types/MethodMap'
import type { HeartbeatOptions } from '@/lib/Heartbeat'
import { AbstractMessagePortAdapter } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'

export interface SharedWorkerPeerPorts {
    data: MessagePort
    control: MessagePort
}

export type PeerClosedHandler = () => void

export class SharedWorkerPeerAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortAdapter<Methods, Events> {
    private _closedHandler?: PeerClosedHandler

    constructor(
        private readonly peerPorts: SharedWorkerPeerPorts,
        heartbeatOptions: HeartbeatOptions | undefined,
    ) {
        super(heartbeatOptions)
    }

    set closedHandler(handler: PeerClosedHandler) {
        this._closedHandler = handler
    }

    connect(): void {
        this.attachPorts(this.peerPorts, { awaitRemote: true })
    }

    protected override onRemoteUnresponsive(): void {
        this.destroy()
    }

    protected override closeConnection(): void {
        super.closeConnection()
        this._closedHandler?.()
    }
}
