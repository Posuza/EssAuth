import type { RequestTransport } from "../transport/request-transport.js";
export declare class TicketService {
    #private;
    constructor(publicKey: string, transport: RequestTransport);
    verify(ticket: string): Promise<string>;
    notifyLogout(employeeId: string): Promise<void>;
}
//# sourceMappingURL=ticket-service.d.ts.map