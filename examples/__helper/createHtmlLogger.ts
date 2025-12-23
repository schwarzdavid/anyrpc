export enum MessageType {
    SENT = 'Sent',
    RECEIVED = 'Received',
    INFO = 'Info',
}

export type LogFn = (type: MessageType, event: string, ...args: unknown[]) => void

const TYPE_COLOR_MAP: Record<MessageType, string> = {
    [MessageType.SENT]: 'success',
    [MessageType.RECEIVED]: 'danger',
    [MessageType.INFO]: 'info',
}

export function createHtmlLogger(list: HTMLUListElement | HTMLOListElement): LogFn {
    return (type, event, ...args: unknown[]) => {
        list.insertAdjacentHTML(
            'afterbegin',
            `<li><strong class="text-${TYPE_COLOR_MAP[type]}">${type}</strong>: ${event} <span class="font-monospace">${JSON.stringify(args)}</span></li>`,
        )
    }
}
