export interface HeartbeatOptions {
    interval: number
    timeout: number
}

export type HeartbeatOption = boolean | Partial<HeartbeatOptions>

export interface HeartbeatCallbacks {
    ping(): void
    onTimeout(): void
}

export const DEFAULT_HEARTBEAT_OPTIONS: HeartbeatOptions = { interval: 5000, timeout: 10000 }

export function resolveHeartbeatOptions(option: HeartbeatOption): HeartbeatOptions | undefined {
    if (option === false) {
        return undefined
    }
    return { ...DEFAULT_HEARTBEAT_OPTIONS, ...(option === true ? {} : option) }
}

export class Heartbeat {
    private intervalId: ReturnType<typeof setInterval> | undefined
    private timeoutId: ReturnType<typeof setTimeout> | undefined

    constructor(
        private readonly options: HeartbeatOptions,
        private readonly callbacks: HeartbeatCallbacks,
    ) {}

    start(): void {
        this.stop()
        this.intervalId = setInterval(() => this.beat(), this.options.interval)
    }

    acknowledge(): void {
        clearTimeout(this.timeoutId)
        this.timeoutId = undefined
    }

    stop(): void {
        clearInterval(this.intervalId)
        this.acknowledge()
    }

    private beat(): void {
        this.callbacks.ping()
        this.timeoutId ??= setTimeout(() => this.expire(), this.options.timeout)
    }

    private expire(): void {
        this.timeoutId = undefined
        this.callbacks.onTimeout()
    }
}
