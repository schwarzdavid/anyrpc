export interface PageToWorker {
    whoAmI(): string
    peerCount(): number
    announce(message: string): void
    collectNames(): Promise<string[]>
}

export interface WorkerToPage {
    getName(): string
    announced(message: string): void
}
