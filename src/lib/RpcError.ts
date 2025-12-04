import {RpcErrorData} from "../types/RpcMessages";
import {RPC_ERROR_MESSAGE_MAP, RPC_ERROR_NAME_MAP, RpcErrorCode} from "../constants/JSON_RPC_ERRORS";

export class RpcError extends Error implements RpcErrorData {
    readonly code: number
    readonly message: string

    constructor(errorCode: RpcErrorCode | RpcErrorData) {
        if(typeof errorCode === 'number') {
            super(RPC_ERROR_NAME_MAP[errorCode]);

            this.code = errorCode;
            this.message = RPC_ERROR_MESSAGE_MAP[errorCode]
        } else {
            super(errorCode.message);
            this.code = errorCode.code;
            this.message = errorCode.message;
        }
    }
}
