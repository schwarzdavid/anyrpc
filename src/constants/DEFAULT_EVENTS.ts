import { ConnectionStatus } from '@/types/ConnectionStatus'

export const CONNECTION_CHANGE_EVENT = 'anyrpc::connection-change'

export interface AnyRpcEvents {
    [CONNECTION_CHANGE_EVENT](status: ConnectionStatus): void
}
