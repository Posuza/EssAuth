import { EssAuthError } from "../core/errors.js";
export class TicketService {
    #publicKey;
    #transport;
    constructor(publicKey, transport) {
        this.#publicKey = publicKey;
        this.#transport = transport;
    }
    async verify(ticket) {
        const normalizedTicket = ticket.trim();
        if (!normalizedTicket) {
            throw new EssAuthError("Ticket cannot be empty.", {
                code: "INVALID_CLIENT_TICKET",
            });
        }
        const result = await this.#transport.post("/client-auth/tickets/verify", { public_key: this.#publicKey, ticket: normalizedTicket }, { fallbackError: "Ticket verification failed." });
        if (typeof result.employee_id !== "string" || !result.employee_id.trim()) {
            throw new EssAuthError("ESS returned an invalid employee identity.", {
                code: "INVALID_TICKET_RESPONSE",
                details: result,
            });
        }
        return result.employee_id;
    }
    async notifyLogout(employeeId) {
        await this.#transport.post("/client-auth/logout", { public_key: this.#publicKey, employee_id: employeeId }, { fallbackError: "Logout notification failed.", keepalive: true });
    }
}
//# sourceMappingURL=ticket-service.js.map