export const ConnectionStatus = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
} as const

export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus]
