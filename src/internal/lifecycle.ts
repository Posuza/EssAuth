import { IdentityStorage } from "./identity-storage.js";
import { browserUrl, callbackTicket, cleanCallbackUrl } from "./redirect.js";
import { TicketService } from "./ticket.js";
import type { AuthInitialization } from "../public/types.js";

export async function initializeIdentity(
  identity: IdentityStorage,
  tickets: TicketService,
): Promise<AuthInitialization> {
  const url = browserUrl();
  const ticket = callbackTicket(url);

  if (!ticket) {
    return { employeeId: identity.restore(), error: null };
  }

  identity.clear();
  try {
    const employeeId = await tickets.verify(ticket);
    identity.save(employeeId);
    return { employeeId, error: null };
  } catch (error) {
    return {
      employeeId: null,
      error: error instanceof Error ? error : new Error("ESS login failed."),
    };
  } finally {
    cleanCallbackUrl(url);
  }
}
