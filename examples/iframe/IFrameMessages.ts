export interface HostToIFrame {
    ping(): void
}

export interface IFrameToHost {
    pong(): void
    size(width: number, height: number): void
}
