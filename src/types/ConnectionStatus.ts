export const ConnectionStatus = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    DESTROYED: 'destroyed',
} as const

export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus]
