export {
    AbstractMessagePortAdapter,
    type AttachPortsOptions,
    type MessagePortLike,
    type MessagePorts,
} from './AbstractMessagePortAdapter'
export { AbstractMessagePortHostAdapter } from './AbstractMessagePortHostAdapter'
export { AbstractMessagePortClientAdapter } from './AbstractMessagePortClientAdapter'
export type { InitRequest, InitResponse } from '@/lib/adapter/message-port/utils/handshake'
export type { HeartbeatOption, HeartbeatOptions } from '@/lib/Heartbeat'
