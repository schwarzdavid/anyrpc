import { describe, expect, it, vi } from 'vitest'
import { assertValidOriginOption, type IFrameOriginOption, isOriginAllowed } from '@/lib/adapter/iframe/iframeOrigin'

const ORIGIN = 'https://example.com'

const originCases: [description: string, option: IFrameOriginOption, origin: string, allowed: boolean][] = [
    ['a matching string', ORIGIN, ORIGIN, true],
    ['a string with different casing and whitespace', ' HTTPS://Example.com ', ORIGIN, true],
    ['a string with a trailing slash', 'https://example.com/', ORIGIN, true],
    ['a string with the default port', 'https://example.com:443', ORIGIN, true],
    ['a string with another port', 'https://example.com:8443', ORIGIN, false],
    ['a string with another scheme', 'http://example.com', ORIGIN, false],
    ['a string with another host', 'https://examples.com', ORIGIN, false],
    ['a string that is no URL', 'example.com', ORIGIN, false],
    ['the opaque origin', 'null', 'null', true],
    ['a matching regex', /^https:\/\/.*\.com$/u, ORIGIN, true],
    ['a regex that does not match', /^https:\/\/.*\.at$/u, ORIGIN, false],
    ['an array containing the origin', ['https://example.at', ORIGIN], ORIGIN, true],
    ['an array containing a matching regex', ['https://example.at', /\.cloud$/u], 'https://test.cloud', true],
    ['an array without a match', ['https://example.at', /\.cloud$/u], ORIGIN, false],
    ['a function returning true', () => true, ORIGIN, true],
    ['a function returning false', () => false, ORIGIN, false],
    ['true', true, 'https://evil.example', true],
]

const validOptions: [description: string, option: IFrameOriginOption | undefined][] = [
    ['undefined', undefined],
    ['true', true],
    ['a string', ORIGIN],
    ['a non-empty array', [ORIGIN]],
]

describe(isOriginAllowed, () => {
    it.each(originCases)('should handle %s', (_, option, origin, allowed) => {
        expect(isOriginAllowed(option, origin)).toBe(allowed)
    })

    it('should pass the origin to a predicate function', () => {
        const predicate = vi.fn<(origin: string) => boolean>(() => false)

        isOriginAllowed(predicate, ORIGIN)

        expect(predicate).toHaveBeenCalledWith(ORIGIN)
    })
})

describe(assertValidOriginOption, () => {
    it('should throw for an empty array', () => {
        expect(() => assertValidOriginOption([])).toThrowError('Origin option cannot be an empty array')
    })

    it.each(validOptions)('should accept %s', (_, option) => {
        expect(() => assertValidOriginOption(option)).not.toThrowError()
    })
})
