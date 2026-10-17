export interface HostToWorker {
    echo(value: string): string
    askHost(name: string): Promise<string>
    block(milliseconds: number): void
    wait(milliseconds: number): Promise<void>
    throwUncaught(message: string): void
    destroyChannel(): void
}

export interface WorkerToHost {
    greet(name: string): string
}

export interface HostToSecondChannel {
    whoAmI(): string
}
