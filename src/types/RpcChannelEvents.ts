import type { ConnectionStatus } from './ConnectionStatus'
import type { RpcError } from '@/lib/RpcError'

export interface RpcChannelEvents {
    'rpc.connected'(): void
    'rpc.disconnected'(): void
    'rpc.status'(status: ConnectionStatus): void
    'rpc.error'(error: RpcError): void
}
