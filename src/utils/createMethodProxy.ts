const PROBED_PROPERTY_NAMES: ReadonlySet<PropertyKey> = new Set(['then', 'toJSON'])

export interface MethodProxy<Meta extends object> {
    readonly $: Meta
}

export function createMethodProxy<Meta extends object>(
    meta: Meta,
    createMethod: (name: string) => unknown,
): MethodProxy<Meta> {
    const target: Record<PropertyKey, unknown> = { $: meta }

    return new Proxy(target, {
        get(target, prop) {
            if (prop in target) {
                return target[prop]
            }
            if (typeof prop === 'symbol' || PROBED_PROPERTY_NAMES.has(prop)) {
                return undefined
            }
            return createMethod(prop)
        },
    }) as unknown as MethodProxy<Meta>
}
