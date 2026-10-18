export type IFrameOriginOption = string | RegExp | (string | RegExp)[] | ((origin: string) => boolean) | true

export function assertValidOriginOption(origin: IFrameOriginOption | undefined): void {
    if (Array.isArray(origin) && !origin.length) {
        throw new Error('Origin option cannot be an empty array')
    }
}

export function isOriginAllowed(allowedOrigin: IFrameOriginOption, origin: string): boolean {
    if (allowedOrigin === true) {
        return true
    }
    if (typeof allowedOrigin === 'function') {
        return allowedOrigin(origin)
    }
    const allowedOrigins = Array.isArray(allowedOrigin) ? allowedOrigin : [allowedOrigin]

    return allowedOrigins.some((allowed) =>
        allowed instanceof RegExp ? allowed.test(origin) : normalizeOrigin(allowed) === normalizeOrigin(origin),
    )
}

function normalizeOrigin(origin: string): string {
    try {
        return new URL(origin).origin
    } catch {
        return origin.trim().toLowerCase()
    }
}
