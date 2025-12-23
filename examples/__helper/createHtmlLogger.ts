export enum MessageType {
    SENT = 'Sent',
    RECEIVED = 'Received',
    INFO = 'Info',
}

export type LogFn = (type: MessageType, event: string, data?: object) => void

const TYPE_COLOR_MAP: Record<MessageType, string> = {
    [MessageType.SENT]: 'success',
    [MessageType.RECEIVED]: 'danger',
    [MessageType.INFO]: 'info',
}

export function createHtmlLogger(list: HTMLUListElement | HTMLOListElement): LogFn {
    return (type, event, data) => {
        list.insertAdjacentHTML(
            'afterbegin',
            `<li><strong class="text-${TYPE_COLOR_MAP[type]}">${type}</strong>: ${event} ${data ? JSON.stringify(data) : ''}</li>`,
        )
    }
}
