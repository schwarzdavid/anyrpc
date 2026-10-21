import { describe, expectTypeOf, it } from 'vitest'
import type { MessagePort as NodeMessagePort } from 'node:worker_threads'
import {
    AbstractMessagePortAdapter,
    AbstractMessagePortClientAdapter,
    AbstractMessagePortHostAdapter,
    type HeartbeatOption,
    type HeartbeatOptions,
    type InitRequest,
    type InitResponse,
    type MessageEventLike,
    type MessagePortLike,
    type MessagePorts,
} from '@/lib/adapter/message-port'

interface Methods {
    ping(): string
}

interface Events {
    pong(value: string): void
}

declare const port: MessagePort
declare const nodePort: NodeMessagePort
declare const nodePorts: NodeMessagePort[]

describe('@schwarzdavid/anyrpc/adapters/message-port entry point', () => {
    it('should let consumers write a host adapter by implementing the handshake transport', () => {
        class CustomHostAdapter extends AbstractMessagePortHostAdapter<Methods, Events> {
            constructor(heartbeat: HeartbeatOption = false) {
                super('anyrpc::custom-init', 'custom', heartbeat)
            }

            protected listenForInitRequests(signal: AbortSignal): void {
                port.addEventListener('message', (event) => this.acceptInitRequest(event.data), { signal })
            }

            protected postInitResponse(response: InitResponse, transfer: Transferable[]): void {
                port.postMessage(response, transfer)
            }
        }

        expectTypeOf(new CustomHostAdapter({ interval: 1000 })).toExtend<AbstractMessagePortAdapter<Methods, Events>>()
    })

    it('should let consumers write a client adapter by implementing the handshake transport', () => {
        class CustomClientAdapter extends AbstractMessagePortClientAdapter<Methods, Events> {
            constructor() {
                super('anyrpc::custom-init', 'custom', 1000)
            }

            protected listenForInitResponses(signal: AbortSignal): void {
                port.addEventListener('message', (event) => this.acceptInitResponse(event), { signal })
            }

            protected postInitRequest(request: InitRequest): void {
                port.postMessage(request)
            }
        }

        expectTypeOf(new CustomClientAdapter()).toExtend<AbstractMessagePortAdapter<Methods, Events>>()
    })

    it('should let client adapters accept ports that arrive inside the message data', () => {
        class PortsInDataClientAdapter extends AbstractMessagePortClientAdapter<Methods, Events> {
            constructor() {
                super('anyrpc::custom-init', 'custom', 1000)
            }

            protected listenForInitResponses(signal: AbortSignal): void {
                port.addEventListener('message', (event) => this.acceptInitResponseData(event.data, nodePorts), {
                    signal,
                })
            }

            protected postInitRequest(request: InitRequest): void {
                port.postMessage(request)
            }
        }

        expectTypeOf(new PortsInDataClientAdapter()).toExtend<AbstractMessagePortAdapter<Methods, Events>>()
    })

    it('should let host adapters declare transfer as the port type of their transport', () => {
        class NodeHostAdapter extends AbstractMessagePortHostAdapter<Methods, Events> {
            constructor() {
                super('anyrpc::custom-init', 'custom', false)
            }

            protected listenForInitRequests(signal: AbortSignal): void {
                port.addEventListener('message', (event) => this.acceptInitRequest(event.data), { signal })
            }

            protected postInitResponse(response: InitResponse, transfer: NodeMessagePort[]): void {
                nodePort.postMessage(response, transfer)
            }
        }

        expectTypeOf(new NodeHostAdapter()).toExtend<AbstractMessagePortAdapter<Methods, Events>>()
    })

    it('should let client adapters keep overriding acceptInitResponse with the DOM message event', () => {
        class OverridingClientAdapter extends AbstractMessagePortClientAdapter<Methods, Events> {
            constructor() {
                super('anyrpc::custom-init', 'custom', 1000)
            }

            protected override acceptInitResponse(event: MessageEvent): void {
                super.acceptInitResponse(event)
            }

            protected listenForInitResponses(signal: AbortSignal): void {
                port.addEventListener('message', (event) => this.acceptInitResponse(event), { signal })
            }

            protected postInitRequest(request: InitRequest): void {
                port.postMessage(request)
            }
        }

        expectTypeOf(new OverridingClientAdapter()).toExtend<AbstractMessagePortAdapter<Methods, Events>>()
    })

    it('should expose the port and heartbeat types', () => {
        expectTypeOf<MessagePorts>().toEqualTypeOf<{ data: MessagePortLike; control?: MessagePortLike }>()
        expectTypeOf<MessagePort>().toExtend<MessagePortLike>()
        expectTypeOf<NodeMessagePort>().toExtend<MessagePortLike>()
        expectTypeOf<MessageEventLike>().toEqualTypeOf<{ data: unknown; ports: readonly MessagePortLike[] }>()
        expectTypeOf<MessageEvent>().toExtend<MessageEventLike>()
        expectTypeOf<HeartbeatOptions>().toEqualTypeOf<{ interval: number; timeout: number }>()
        expectTypeOf<HeartbeatOption>().toEqualTypeOf<boolean | Partial<HeartbeatOptions>>()
    })
})
