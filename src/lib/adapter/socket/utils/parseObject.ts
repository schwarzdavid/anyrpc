export function parseObject(json: string): object | undefined {
    try {
        const value: unknown = JSON.parse(json)
        return typeof value === 'object' && value !== null ? value : undefined
    } catch {
        return undefined
    }
}
