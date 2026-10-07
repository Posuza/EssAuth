import { JsonTransport } from "./transport.js";
export declare class TicketService {
    #private;
    constructor(publicKey: string, transport: JsonTransport);
    verify(ticket: string): Promise<string>;
    notifyLogout(employeeId: string): Promise<void>;
}
//# sourceMappingURL=ticket.d.ts.map