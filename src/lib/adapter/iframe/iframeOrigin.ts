export type IFrameOriginOption = string | RegExp | (string | RegExp)[] | ((origin: string) => boolean) | true

const ANY_ORIGIN = '*'

export function assertValidOriginOption(origin: IFrameOriginOption | undefined): void {
    if (Array.isArray(origin) && !origin.length) {
        throw new Error('Origin option cannot be an empty array')
    }
}

export function allowsAnyOrigin(allowedOrigin: IFrameOriginOption): boolean {
    return isWildcard(allowedOrigin) || (Array.isArray(allowedOrigin) && allowedOrigin.some(isWildcard))
}

export function isOriginAllowed(allowedOrigin: IFrameOriginOption, origin: string): boolean {
    if (isWildcard(allowedOrigin)) {
        return true
    }
    if (typeof allowedOrigin === 'function') {
        return allowedOrigin(origin)
    }
    const allowedOrigins = Array.isArray(allowedOrigin) ? allowedOrigin : [allowedOrigin]

    return allowedOrigins.some((allowed) => isWildcard(allowed) || matchesOrigin(allowed, origin))
}

function isWildcard(option: IFrameOriginOption): option is true | typeof ANY_ORIGIN {
    return option === true || option === ANY_ORIGIN
}

function matchesOrigin(allowed: string | RegExp, origin: string): boolean {
    if (allowed instanceof RegExp) {
        return matchesIgnoringLastIndex(allowed, origin)
    }
    return normalizeOrigin(allowed) === normalizeOrigin(origin)
}

function matchesIgnoringLastIndex(pattern: RegExp, origin: string): boolean {
    return origin.search(pattern) !== -1
}

function normalizeOrigin(origin: string): string {
    try {
        return new URL(origin).origin
    } catch {
        return origin.trim().toLowerCase()
    }
}
