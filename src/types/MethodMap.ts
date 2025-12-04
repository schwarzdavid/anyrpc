export type MethodFn = (...data: unknown[]) => unknown

export type MethodMap = Record<string, MethodFn>
