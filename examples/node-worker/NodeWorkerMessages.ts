export interface MainToWorker {
    fibonacci(n: number): number
}

export interface WorkerToMain {
    progress(step: number, total: number): void
}
