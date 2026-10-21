export interface MainToWorker {
    add(a: number, b: number): number
    askForGreeting(name: string): string
    exit(code: number): void
}

export interface WorkerToMain {
    greet(name: string): string
}
