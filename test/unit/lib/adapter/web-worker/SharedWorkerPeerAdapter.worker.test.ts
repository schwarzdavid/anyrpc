import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharedWorkerPeerAdapter } from '@/lib/adapter/web-worker/SharedWorkerPeerAdapter'
import { ControlMethod, createControlMessage, readControlMethod } from '@/utils/controlMessages'
import { ConnectionStatus } from '@/types/ConnectionStatus'
import { LogLevel } from '@/types/LogLevel'
import { confirmHandshake } from '../../../__helper/confirmHandshake'
import { bindAdapter } from '../../../__helper/bindAdapter'

interface TestMethods {
    foo(value: string): void
}

function waitForControlMessage(port: MessagePort, method: ControlMethod): Promise<void> {
    return new Promise((resolve) => {
        port.addEventListener('message', (event) => {
            if (readControlMethod(event.data) === method) {
                resolve()
            }
        })
        port.start()
    })
}

describe(SharedWorkerPeerAdapter, () => {
    let dataChannel: MessageChannel
    let controlChannel: MessageChannel
    let adapter: SharedWorkerPeerAdapter<TestMethods, TestMethods>

    function createAdapter(heartbeat = { interval: 10, timeout: 10 }) {
        adapter = new SharedWorkerPeerAdapter({ data: dataChannel.port1, control: controlChannel.port1 }, heartbeat)
        bindAdapter(adapter, { logLevel: LogLevel.NONE })
        return adapter
    }

    beforeEach(() => {
        dataChannel = new MessageChannel()
        controlChannel = new MessageChannel()
    })

    afterEach(() => {
        adapter.destroy()
        dataChannel.port2.close()
        controlChannel.port2.close()
    })

    it('should connect once the page answers the handshake ping', async () => {
        createAdapter().connect()

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DISCONNECTED)

        await confirmHandshake(controlChannel.port2)

        expect(adapter.connectionStatus).toBe(ConnectionStatus.CONNECTED)
    })

    it('should destroy itself when the page says goodbye', async () => {
        createAdapter().connect()
        await confirmHandshake(controlChannel.port2)

        controlChannel.port2.postMessage(createControlMessage(ControlMethod.GOODBYE))

        await vi.waitFor(() => expect(adapter.connectionStatus).toBe(ConnectionStatus.DESTROYED))
    })

    it('should say goodbye and destroy itself when the page stops answering the heartbeat', async () => {
        createAdapter().connect()
        await confirmHandshake(controlChannel.port2)
        const goodbye = waitForControlMessage(controlChannel.port2, ControlMethod.GOODBYE)

        await vi.waitFor(() => expect(adapter.connectionStatus).toBe(ConnectionStatus.DESTROYED))

        await expect(goodbye).resolves.toBeUndefined()
    })

    it('should work without a heartbeat', () => {
        adapter = new SharedWorkerPeerAdapter({ data: dataChannel.port1, control: controlChannel.port1 }, undefined)

        adapter.connect()
        adapter.destroy()

        expect(adapter.connectionStatus).toBe(ConnectionStatus.DESTROYED)
    })
})
