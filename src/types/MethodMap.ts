// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MethodFn = (...data: any[]) => any

// export type MethodMap = Record<string, MethodFn>
export type MethodMap<Events> = {
    [K in keyof Events]: MethodFn
}
