import { IdentityStore } from "../storage/identity-store.js";
import {
  browserUrl,
  callbackError,
  callbackTicket,
  cleanCallbackUrl,
} from "./redirect.js";
import { EssAuthError } from "../core/errors.js";
import { TicketService } from "./ticket-service.js";
import type { AuthInitialization } from "../../public/types.js";

export async function initializeIdentity(
  identity: IdentityStore,
  tickets: TicketService,
): Promise<AuthInitialization> {
  const url = browserUrl();
  const returnedError = callbackError(url);
  const ticket = callbackTicket(url);

  if (returnedError) {
    cleanCallbackUrl(url);
    return {
      employeeId: null,
      error: new EssAuthError(
        returnedError === "invalid_callback"
          ? "ESS rejected an unregistered callback address."
          : "ESS login could not continue.",
        { code: returnedError.toUpperCase() },
      ),
    };
  }

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
