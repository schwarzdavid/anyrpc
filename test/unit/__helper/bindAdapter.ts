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

export function bindHubAdapter<
    Methods extends MethodMap<Methods>,
    Events extends MethodMap<Events>,
    Context = undefined,
>(
    hubAdapter: AbstractRpcHubAdapter<Methods, Events, Context>,
    binding: Partial<RpcHubAdapterBinding<Methods, Events, Context>>,
): void {
    const mergedBinding: RpcHubAdapterBinding<Methods, Events, Context> = {
        onPeer: () => undefined,
        onPeerLost: () => undefined,
        logLevel: LogLevel.NONE,
        ...(hubAdapterBindings.get(hubAdapter) as Partial<RpcHubAdapterBinding<Methods, Events, Context>> | undefined),
        ...binding,
    }

    hubAdapterBindings.set(hubAdapter, mergedBinding)
    hubAdapter.bind(mergedBinding)
}
