export interface ClientToServer {
    sendChat(text: string): void
}

export interface ServerToClient {
    chatMessage(text: string): void
}
