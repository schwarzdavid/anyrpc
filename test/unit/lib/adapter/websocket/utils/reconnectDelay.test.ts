import { describe, expect, it } from 'vitest'
import { reconnectDelay } from '@/lib/adapter/websocket/utils/reconnectDelay'

describe(reconnectDelay, () => {
    it.each([
        [0, 1000],
        [1, 2000],
        [2, 4000],
        [4, 16000],
        [5, 30000],
        [20, 30000],
    ])('should wait %i attempts → %i ms', (attempt, delay) => {
        expect(reconnectDelay(attempt)).toBe(delay)
    })
})
