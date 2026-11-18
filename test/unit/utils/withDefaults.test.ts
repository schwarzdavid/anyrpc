import { describe, expect, it } from 'vitest'
import { withDefaults } from '@/utils/withDefaults'

interface Options {
    timeout: number
    enabled: boolean
}

const DEFAULTS: Options = { timeout: 3000, enabled: false }

describe(withDefaults, () => {
    it('should return the defaults without overrides', () => {
        expect(withDefaults(DEFAULTS, {})).toStrictEqual(DEFAULTS)
    })

    it('should prefer overrides, including falsy ones', () => {
        expect(withDefaults({ timeout: 3000, enabled: true }, { timeout: 0, enabled: false })).toStrictEqual({
            timeout: 0,
            enabled: false,
        })
    })

    it('should keep the default for an override that is undefined', () => {
        const overrides = { timeout: undefined } as unknown as Partial<Options>

        expect(withDefaults(DEFAULTS, overrides)).toStrictEqual(DEFAULTS)
    })

    it('should not modify the defaults', () => {
        withDefaults(DEFAULTS, { timeout: 1 })

        expect(DEFAULTS).toStrictEqual({ timeout: 3000, enabled: false })
    })
})
