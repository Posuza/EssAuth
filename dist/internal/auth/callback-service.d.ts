import type { RequestTransport } from "../transport/request-transport.js";
export declare class CallbackService {
    #private;
    constructor(publicKey: string, transport: RequestTransport);
    validate(returnTo: string): Promise<void>;
}
//# sourceMappingURL=callback-service.d.ts.map