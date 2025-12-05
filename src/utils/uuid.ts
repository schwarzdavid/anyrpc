export function uuid(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID()
    }

    const variant = (Math.floor(Math.random() * 4) + 8).toString(16)
    return `xxxxxxxx-xxxx-4xxx-${variant}xxx-xxxxxxxxxxxx`.replaceAll('x', () =>
        Math.floor(Math.random() * 16).toString(16),
    )
}
