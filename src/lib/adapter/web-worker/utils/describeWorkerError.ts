export function describeWorkerError(event: Event, workerKind: string): string {
    if (event instanceof ErrorEvent) {
        return `Uncaught error in ${workerKind}: ${event.message} (${[event.filename, event.lineno, event.colno].join(':')})`
    }
    return (
        `The ${workerKind} could not be started, so the channel will never connect. ` +
        'Check that the script URL is correct and served with a JavaScript MIME type.'
    )
}
