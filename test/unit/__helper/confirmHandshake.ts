import {
    ControlMethod,
    createControlMessage,
    readControlMethod,
} from '@/lib/adapter/message-port/utils/controlMessages'

export function confirmHandshake(controlPort: MessagePort): Promise<void> {
    return new Promise((resolve) => {
        controlPort.addEventListener('message', (event) => {
            if (readControlMethod(event.data) === ControlMethod.PONG) {
                resolve()
            }
        })
        controlPort.start()
        controlPort.postMessage(createControlMessage(ControlMethod.PONG))
        controlPort.postMessage(createControlMessage(ControlMethod.PING))
    })
}
