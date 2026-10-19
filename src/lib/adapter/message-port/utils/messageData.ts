export function readMessageData(event: Event): unknown {
    return 'data' in event ? event.data : undefined
}
