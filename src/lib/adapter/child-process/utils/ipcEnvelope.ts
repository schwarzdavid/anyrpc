export interface IpcEnvelope {
    anyrpc: string
    message: object
}

export function createIpcEnvelope(name: string, message: object): IpcEnvelope {
    return { anyrpc: name, message }
}

export function readIpcEnvelope(value: unknown, name: string): object | undefined {
    if (typeof value !== 'object' || value === null || !('anyrpc' in value) || !('message' in value)) {
        return undefined
    }
    if (value.anyrpc !== name) {
        return undefined
    }
    const { message } = value
    return typeof message === 'object' && message !== null ? message : undefined
}
