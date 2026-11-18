import type { RpcAdapterBinding } from '@/lib/adapter/AbstractRpcAdapter'
import type { AbstractRpcHubAdapter, RpcHubAdapterBinding } from '@/lib/adapter/AbstractRpcHubAdapter'
import { LogLevel } from '@/types/LogLevel'
import type { MethodMap } from '@/types/MethodMap'

interface BindableAdapter {
    bind(binding: RpcAdapterBinding): void
}

const adapterBindings = new WeakMap<object, RpcAdapterBinding>()
const hubAdapterBindings = new WeakMap<object, object>()

export function bindAdapter(adapter: BindableAdapter, binding: Partial<RpcAdapterBinding>): void {
    const mergedBinding: RpcAdapterBinding = {
        onMessage: () => undefined,
        onStatusChange: () => undefined,
        onConnectionLost: () => undefined,
        logLevel: LogLevel.NONE,
        ...adapterBindings.get(adapter),
        ...binding,
    }

    adapterBindings.set(adapter, mergedBinding)
    adapter.bind(mergedBinding)
}

export function bindHubAdapter<Methods extends MethodMap<Methods>, Events extends MethodMap<Events>>(
    hubAdapter: AbstractRpcHubAdapter<Methods, Events>,
    binding: Partial<RpcHubAdapterBinding<Methods, Events>>,
): void {
    const mergedBinding: RpcHubAdapterBinding<Methods, Events> = {
        onPeer: () => undefined,
        onPeerLost: () => undefined,
        logLevel: LogLevel.NONE,
        ...(hubAdapterBindings.get(hubAdapter) as Partial<RpcHubAdapterBinding<Methods, Events>> | undefined),
        ...binding,
    }

    hubAdapterBindings.set(hubAdapter, mergedBinding)
    hubAdapter.bind(mergedBinding)
}
