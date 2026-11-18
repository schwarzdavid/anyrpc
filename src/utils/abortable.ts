export function abortable<Result>(signal: AbortSignal | undefined, start: () => Promise<Result>): Promise<Result> {
    if (!signal) {
        return start()
    }
    if (signal.aborted) {
        return Promise.reject(signal.reason as Error)
    }
    const result = start()

    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason as Error)

        signal.addEventListener('abort', abort, { once: true })
        result.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    })
}
