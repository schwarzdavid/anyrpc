export function nextMessage(port: MessagePort): Promise<unknown> {
    return new Promise((resolve) => {
        port.addEventListener('message', (event) => resolve(event.data), { once: true })
        port.start()
    })
}
