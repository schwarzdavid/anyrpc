import type { ConnectionStatus } from './ConnectionStatus'

export interface RpcConnectionEvents {
    'rpc.connected'(): void
    'rpc.disconnected'(): void
    'rpc.status'(status: ConnectionStatus): void
}
