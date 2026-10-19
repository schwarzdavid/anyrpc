export interface PageToWorker {
    increment(): number
    collectTitles(): Promise<string[]>
}

export interface WorkerToPage {
    getTitle(): string
    counterChanged(value: number): void
    peersChanged(count: number): void
}
