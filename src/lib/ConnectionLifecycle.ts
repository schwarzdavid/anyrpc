import { ConnectionStatus } from '@/types/ConnectionStatus'

export type ConnectionStatusListener = (status: ConnectionStatus) => void

const ALLOWED_TRANSITIONS: Record<ConnectionStatus, readonly ConnectionStatus[]> = {
    [ConnectionStatus.DISCONNECTED]: [ConnectionStatus.CONNECTED, ConnectionStatus.DESTROYED],
    [ConnectionStatus.CONNECTED]: [ConnectionStatus.DISCONNECTED, ConnectionStatus.DESTROYED],
    [ConnectionStatus.DESTROYED]: [],
}

export class ConnectionLifecycle {
    private _status: ConnectionStatus = ConnectionStatus.DISCONNECTED

    constructor(private readonly onTransition: ConnectionStatusListener) {}

    get status(): ConnectionStatus {
        return this._status
    }

    get isDestroyed(): boolean {
        return this._status === ConnectionStatus.DESTROYED
    }

    transitionTo(status: ConnectionStatus): boolean {
        if (!ALLOWED_TRANSITIONS[this._status].includes(status)) {
            return false
        }
        this._status = status
        this.onTransition(status)
        return true
    }
}
