import { RpcError } from '@/lib/RpcError'
import { RpcErrorCode } from '@/constants/JSON_RPC_ERRORS'
import type { RpcId } from '@/types/RpcMessages'

interface PendingRequest {
    resolve(result: unknown): void
    reject(error: Error): void
}

export class PendingRequests {
    private readonly pending = new Map<string, PendingRequest>()

    constructor(private readonly timeout: number) {}

    track(id: string, send: () => void): Promise<unknown> {
        let timeoutId: ReturnType<typeof setTimeout> | undefined

        return new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => reject(new RpcError(RpcErrorCode.TIMEOUT_ERROR)), this.timeout)
            this.pending.set(id, { resolve, reject })

            send()
        }).finally(() => {
            clearTimeout(timeoutId)
            this.pending.delete(id)
        })
    }

    resolve(id: RpcId, result: unknown): void {
        this.pending.get(String(id))?.resolve(result)
    }

    reject(id: RpcId, error: Error): void {
        this.pending.get(String(id))?.reject(error)
    }

    rejectAll(error: Error): void {
        this.pending.forEach((request) => request.reject(error))
    }
}
