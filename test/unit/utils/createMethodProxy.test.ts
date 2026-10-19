import { describe, expect, it, vi } from 'vitest'
import { createMethodProxy } from '@/utils/createMethodProxy'

function createUntypedProxy(createMethod: (name: string) => unknown) {
    return createMethodProxy({ name: 'meta' }, createMethod) as unknown as Record<PropertyKey, unknown>
}

describe(createMethodProxy, () => {
    it('should expose the meta object as $', () => {
        const meta = { name: 'meta' }

        expect(createMethodProxy(meta, vi.fn<(name: string) => unknown>()).$).toBe(meta)
    })

    it('should create a method for every other property name', () => {
        const createMethod = vi.fn<(name: string) => unknown>((name) => `method:${name}`)

        expect(createUntypedProxy(createMethod).ping).toBe('method:ping')
        expect(createMethod).toHaveBeenCalledExactlyOnceWith('ping')
    })

    it('should not create methods for symbols and properties probed by promises and JSON', () => {
        const createMethod = vi.fn<(name: string) => unknown>()
        const proxy = createUntypedProxy(createMethod)

        expect(proxy.then).toBeUndefined()
        expect(proxy.toJSON).toBeUndefined()
        expect(proxy[Symbol.iterator]).toBeUndefined()
        expect(createMethod).not.toHaveBeenCalled()
    })
})
