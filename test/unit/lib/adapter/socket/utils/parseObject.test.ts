import { describe, expect, it } from 'vitest'
import { parseObject } from '@/lib/adapter/socket/utils/parseObject'

describe(parseObject, () => {
    it('should parse a JSON object', () => {
        expect(parseObject('{"jsonrpc":"2.0"}')).toStrictEqual({ jsonrpc: '2.0' })
    })

    it('should parse a JSON array', () => {
        expect(parseObject('[1]')).toStrictEqual([1])
    })

    it.each(['not json', '5', '"text"', 'null'])('should return undefined for %s', (json) => {
        expect(parseObject(json)).toBeUndefined()
    })
})
