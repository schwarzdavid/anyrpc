import { ConnectionStatus } from '@/types/ConnectionStatus'

export const CONNECTION_CHANGE_EVENT = 'connection-change'
export const CONNECTED_EVENT = 'connected'
export const CONNECTION_CLOSED_EVENT = 'closed'

export interface AnyRpcEvents {
    [CONNECTION_CHANGE_EVENT](status: ConnectionStatus): void
    [CONNECTED_EVENT](): void
    [CONNECTION_CLOSED_EVENT](): void
}
