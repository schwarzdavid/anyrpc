import { describe, expectTypeOf, it } from 'vitest'
import type { AssertCallableMethodNames, ForbiddenMethodNames } from '@/types/MethodName'

describe('assertion of callable method names', () => {
    it('should accept method maps with callable names', () => {
        expectTypeOf<AssertCallableMethodNames<{ ping(): void }, { pong(): void }>>().toEqualTypeOf<unknown>()
    })

    it('should accept index signatures and empty maps', () => {
        expectTypeOf<
            AssertCallableMethodNames<Record<string, () => void>, Record<never, never>>
        >().toEqualTypeOf<unknown>()
    })

    it('should name the uncallable methods of both sides', () => {
        expectTypeOf<
            AssertCallableMethodNames<{ toString(): string; then(): void }, { 'rpc.custom'(): void }>
        >().toEqualTypeOf<ForbiddenMethodNames<'toString' | 'then' | 'rpc.custom'>>()
    })

    it('should treat $, toJSON and the members of Object.prototype as uncallable', () => {
        expectTypeOf<
            AssertCallableMethodNames<
                { $(): void; toJSON(): string; valueOf(): number; hasOwnProperty(): boolean },
                Record<never, never>
            >
        >().toEqualTypeOf<ForbiddenMethodNames<'$' | 'toJSON' | 'valueOf' | 'hasOwnProperty'>>()
    })
})
