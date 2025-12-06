import { describe, expect, it, vi } from 'vitest'
import { uuid } from '@/utils/uuid'

describe(uuid, () => {
    it('generates valid UUID when crypto.randomUUID is available', () => {
        const mockUUID = '123e4567-e89b-12d3-a456-426614174000'
        const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(mockUUID)

        const result = uuid()

        expect(result).toBe(mockUUID)
        expect(spy).toHaveBeenCalledTimes(1)

        spy.mockRestore()
    })

    it('generates valid UUID when crypto.randomUUID is not available', () => {
        vi.stubGlobal('crypto', {})

        const result = uuid()

        expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

        vi.unstubAllGlobals()
    })
})
