export interface ProcessLike {
    readonly connected: boolean
    send?: IpcSend | undefined
    on(event: 'message', listener: (message: unknown) => void): unknown
    on(event: 'disconnect', listener: () => void): unknown
    off(event: 'message', listener: (message: unknown) => void): unknown
    off(event: 'disconnect', listener: () => void): unknown
}

type IpcSend = (
    message: unknown,
    sendHandle: undefined,
    options: undefined,
    callback: (error: Error | null) => void,
) => boolean

export interface IpcProcess extends ProcessLike {
    send: IpcSend
}

export function currentProcess(): ProcessLike {
    return process
}

export function hasIpcChannel(candidate: ProcessLike): candidate is IpcProcess {
    return typeof candidate.send === 'function'
}
