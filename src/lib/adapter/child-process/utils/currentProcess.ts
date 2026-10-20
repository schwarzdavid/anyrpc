export interface ProcessLike {
    readonly connected: boolean
    send?: ((message: unknown) => boolean) | undefined
    on(event: 'message', listener: (message: unknown) => void): unknown
    on(event: 'disconnect', listener: () => void): unknown
    off(event: 'message', listener: (message: unknown) => void): unknown
    off(event: 'disconnect', listener: () => void): unknown
}

export interface IpcProcess extends ProcessLike {
    send(message: unknown): boolean
}

export function currentProcess(): ProcessLike {
    return process
}

export function hasIpcChannel(candidate: ProcessLike): candidate is IpcProcess {
    return typeof candidate.send === 'function'
}
