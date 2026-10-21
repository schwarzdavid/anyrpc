export interface ParentToChild {
    add(a: number, b: number): number
    askForGreeting(name: string): string
    exit(code: number): void
    shutdown(): void
    recreateChannel(): number
    generation(): number
}

export interface ChildToParent {
    greet(name: string): string
}
