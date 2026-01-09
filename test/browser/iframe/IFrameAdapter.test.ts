import { describe, expect, it, vi } from 'vitest'
import { setupIFramePage } from './fixtures/iframe/setupIFramePage'
import { ConnectionStatus } from '@/types/ConnectionStatus'

describe('iFrameAdapter', () => {
    it('should establish a connection', async () => {
        const { hostRpc, frameRpc } = await setupIFramePage()

        const hostConnectionListener = vi.fn<(status: ConnectionStatus) => void>()
        const frameConnectionListener = vi.fn<(status: ConnectionStatus) => void>()

        hostRpc.addEventListener('anyrpc::connection-change', hostConnectionListener)
        frameRpc.addEventListener('anyrpc::connection-change', frameConnectionListener)

        expect(hostConnectionListener).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)
        expect(frameConnectionListener).toHaveBeenCalledWith(ConnectionStatus.CONNECTED)
    })
})
