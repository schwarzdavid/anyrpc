export interface HostToWorker {
    fibonacci(n: number): number
    block(milliseconds: number): void
}

export interface WorkerToHost {
    progress(step: number, total: number): void
}
