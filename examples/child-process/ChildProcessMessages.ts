export interface ParentToChild {
    hash(text: string): string
}

export interface ChildToParent {
    log(message: string): void
}
