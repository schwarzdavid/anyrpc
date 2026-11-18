export function withDefaults<Options extends object>(defaults: Options, overrides: Partial<Options>): Options {
    const definedOverrides = Object.entries(overrides).filter(([, value]) => value !== undefined)

    return { ...defaults, ...Object.fromEntries(definedOverrides) }
}
