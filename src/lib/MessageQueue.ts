export interface QueuedMessage {
    send(): Promise<void>
    expire(): void
    discard(): void
}

export interface MessageQueueOptions {
    timeout: number
    awaitEach: boolean
}

interface QueueEntry {
    message: QueuedMessage
    timeoutId: ReturnType<typeof setTimeout>
}

export class MessageQueue {
    private readonly entries: QueueEntry[] = []
    private isDraining = false

    constructor(private readonly options: MessageQueueOptions) {}

    enqueue(message: QueuedMessage): void {
        const entry: QueueEntry = {
            message,
            timeoutId: setTimeout(() => {
                this.entries.splice(this.entries.indexOf(entry), 1)
                message.expire()
            }, this.options.timeout),
        }

        this.entries.push(entry)
    }

    async drain(canSend: () => boolean, onDrained: () => void): Promise<void> {
        if (this.isDraining) {
            return
        }
        this.isDraining = true
        try {
            while (canSend()) {
                const message = this.take()
                if (!message) {
                    break
                }
                const sending = message.send()

                if (this.options.awaitEach) {
                    await sending
                }
            }
        } finally {
            this.isDraining = false
        }
        onDrained()
    }

    discardAll(): void {
        this.entries.splice(0).forEach(({ message, timeoutId }) => {
            clearTimeout(timeoutId)
            message.discard()
        })
    }

    private take(): QueuedMessage | undefined {
        const entry = this.entries.shift()
        if (!entry) {
            return undefined
        }
        clearTimeout(entry.timeoutId)
        return entry.message
    }
}
