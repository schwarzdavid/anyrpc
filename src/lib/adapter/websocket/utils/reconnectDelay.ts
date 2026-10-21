import { INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY } from '../constants/webSocket'

export function reconnectDelay(attempt: number): number {
    return Math.min(INITIAL_RECONNECT_DELAY * 2 ** attempt, MAX_RECONNECT_DELAY)
}
