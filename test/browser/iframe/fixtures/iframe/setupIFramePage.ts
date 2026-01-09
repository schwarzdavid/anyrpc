import hostHtml from './host.html?raw'
import iframeHtml from './iframe.html?raw'
import { InternalMethodMap } from '@/types/MethodMap'
import { createRpcChannel } from '@/createRpcChannel'
import { IFrameHostAdapter } from '@/lib/adapter/iframe'
import { RpcChannel } from '@/types/RpcChannel'

export interface IFramePageSetup<
    HostToFrame extends InternalMethodMap<HostToFrame>,
    FrameToHost extends InternalMethodMap<FrameToHost>,
> {
    hostRpc: RpcChannel<HostToFrame, FrameToHost>
    frameRpc: RpcChannel<FrameToHost, HostToFrame>
}

export async function setupIFramePage<
    HostToFrame extends InternalMethodMap<HostToFrame>,
    FrameToHost extends InternalMethodMap<FrameToHost>,
>(): Promise<IFramePageSetup<HostToFrame, FrameToHost>> {
    document.body.innerHTML = hostHtml

    const iframeElement = document.querySelector<HTMLIFrameElement>('#iframe')!
    iframeElement.srcdoc = iframeHtml

    await new Promise<void>((resolve) => {
        if (iframeElement.contentDocument?.readyState === 'loading') {
            return resolve()
        }
        iframeElement.addEventListener('load', () => resolve(), { once: true })
    })

    const hostRpc = createRpcChannel<HostToFrame, FrameToHost>(new IFrameHostAdapter(iframeElement))
    const frameRpc = (iframeElement.contentWindow!.window as any).__rpc__ as RpcChannel<FrameToHost, HostToFrame>

    return {
        hostRpc,
        frameRpc,
    }
}
