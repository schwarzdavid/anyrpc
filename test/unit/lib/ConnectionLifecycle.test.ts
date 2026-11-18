import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionLifecycle, type ConnectionStatusListener } from '@/lib/ConnectionLifecycle'
import { ConnectionStatus } from '@/types/ConnectionStatus'

describe(ConnectionLifecycle, () => {
    let onTransition: ReturnType<typeof vi.fn<ConnectionStatusListener>>
    let lifecycle: ConnectionLifecycle

    beforeEach(() => {
        onTransition = vi.fn<ConnectionStatusListener>()
        lifecycle = new ConnectionLifecycle(onTransition)
    })

    it('should start disconnected', () => {
        expect(lifecycle.status).toBe(ConnectionStatus.DISCONNECTED)
        expect(lifecycle.isDestroyed).toBe(false)
    })

    it('should switch between connected and disconnected and report every change', () => {
        expect(lifecycle.transitionTo(ConnectionStatus.CONNECTED)).toBe(true)
        expect(lifecycle.transitionTo(ConnectionStatus.DISCONNECTED)).toBe(true)
        expect(lifecycle.transitionTo(ConnectionStatus.CONNECTED)).toBe(true)

        expect(lifecycle.status).toBe(ConnectionStatus.CONNECTED)
        expect(onTransition.mock.calls).toStrictEqual([
            [ConnectionStatus.CONNECTED],
            [ConnectionStatus.DISCONNECTED],
            [ConnectionStatus.CONNECTED],
        ])
    })

    it.each([ConnectionStatus.DISCONNECTED, ConnectionStatus.CONNECTED])(
        'should ignore a transition from %s to itself',
        (status) => {
            lifecycle.transitionTo(status)
            onTransition.mockClear()

            expect(lifecycle.transitionTo(status)).toBe(false)
            expect(onTransition).not.toHaveBeenCalled()
        },
    )

    it.each([ConnectionStatus.DISCONNECTED, ConnectionStatus.CONNECTED])('should be destroyable while %s', (status) => {
        lifecycle.transitionTo(status)

        expect(lifecycle.transitionTo(ConnectionStatus.DESTROYED)).toBe(true)
        expect(lifecycle.isDestroyed).toBe(true)
        expect(onTransition).toHaveBeenLastCalledWith(ConnectionStatus.DESTROYED)
    })

    it.each(Object.values(ConnectionStatus))('should never leave destroyed for %s', (status) => {
        lifecycle.transitionTo(ConnectionStatus.DESTROYED)
        onTransition.mockClear()

        expect(lifecycle.transitionTo(status)).toBe(false)
        expect(lifecycle.status).toBe(ConnectionStatus.DESTROYED)
        expect(onTransition).not.toHaveBeenCalled()
    })
})
