export interface HostToWorker {
    echo(value: string): string
    askHost(name: string): Promise<string>
    block(milliseconds: number): void
    wait(milliseconds: number): Promise<void>
    fail(message: string): void
    failWithCode(code: number, message: string): void
    unclonable(): () => void
    report(value: string): void
    throwUncaught(message: string): void
    destroyChannel(): void
    close(): void
}

export interface WorkerToHost {
    greet(name: string): string
    reported(value: string): void
}

export interface HostToSecondChannel {
    whoAmI(): string
}
