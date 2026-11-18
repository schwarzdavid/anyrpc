import type { MethodMap } from '@/types/MethodMap'
import type { HeartbeatOptions } from '@/lib/Heartbeat'
import { AbstractMessagePortAdapter } from '@/lib/adapter/message-port/AbstractMessagePortAdapter'

export interface SharedWorkerPeerPorts {
    data: MessagePort
    control: MessagePort
}

export class SharedWorkerPeerAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
> extends AbstractMessagePortAdapter<Methods, Events> {
    constructor(
        private readonly peerPorts: SharedWorkerPeerPorts,
        heartbeatOptions: HeartbeatOptions | undefined,
    ) {
        super(heartbeatOptions)
    }

    connect(): void {
        this.attachPorts(this.peerPorts, { awaitRemote: true })
    }

    protected override onRemoteGoodbye(): void {
        this.destroy()
    }

    protected override onRemoteUnresponsive(): void {
        this.destroy()
    }
}
