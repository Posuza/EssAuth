import { EssAuthError } from "../core/errors.js";
import type { RequestTransport } from "../transport/request-transport.js";

type TicketVerificationResponse = {
  employee_id: string;
};

export class TicketService {
  readonly #publicKey: string;
  readonly #transport: RequestTransport;

  constructor(publicKey: string, transport: RequestTransport) {
    this.#publicKey = publicKey;
    this.#transport = transport;
  }

  async verify(ticket: string): Promise<string> {
    const normalizedTicket = ticket.trim();
    if (!normalizedTicket) {
      throw new EssAuthError("Ticket cannot be empty.", {
        code: "INVALID_CLIENT_TICKET",
      });
    }

    const result = await this.#transport.post<TicketVerificationResponse>(
      "/client-auth/tickets/verify",
      { public_key: this.#publicKey, ticket: normalizedTicket },
      { fallbackError: "Ticket verification failed." },
    );
    if (typeof result.employee_id !== "string" || !result.employee_id.trim()) {
      throw new EssAuthError("ESS returned an invalid employee identity.", {
        code: "INVALID_TICKET_RESPONSE",
        details: result,
      });
    }
    return result.employee_id;
  }

  async notifyLogout(employeeId: string): Promise<void> {
    await this.#transport.post<{ message: string }>(
      "/client-auth/logout",
      { public_key: this.#publicKey, employee_id: employeeId },
      { fallbackError: "Logout notification failed.", keepalive: true },
    );
  }
}
