export interface HostToIFrame {
    echo(value: string): string
    askHost(name: string): Promise<string>
    wait(milliseconds: number): Promise<void>
    fail(message: string): void
    failWithCode(code: number, message: string): void
    unclonable(): () => void
    report(value: string): void
    destroyChannel(): void
}

export interface IFrameToHost {
    greet(name: string): string
    reported(value: string): void
}
