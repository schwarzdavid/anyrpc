export type ReservedMethodName = `rpc.${string}`

export type UncallableMethodName = '$' | 'then' | 'toJSON' | ReservedMethodName | keyof typeof Object.prototype

export interface ForbiddenMethodNames<Names extends PropertyKey> {
    readonly forbiddenMethodNames: Names
}

export type AssertCallableMethodNames<Methods, Events> = [
    Extract<keyof Methods | keyof Events, UncallableMethodName>,
] extends [never]
    ? unknown
    : ForbiddenMethodNames<Extract<keyof Methods | keyof Events, UncallableMethodName>>
