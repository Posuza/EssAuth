import { IdentityStore } from "../storage/identity-store.js";
import { CallbackService } from "./callback-service.js";
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
  callbacks: CallbackService,
): Promise<AuthInitialization> {
  const url = browserUrl();
  const returnedError = callbackError(url);
  const ticket = callbackTicket(url);

  try {
    await callbacks.validate(url.toString());
  } catch (error) {
    cleanCallbackUrl(url);
    return {
      employeeId: null,
      error: error instanceof Error ? error : new Error("ESS client validation failed."),
      callbackValidated: false,
    };
  }

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
      callbackValidated: true,
    };
  }

  if (!ticket) {
    return {
      employeeId: identity.restore(),
      error: null,
      callbackValidated: true,
    };
  }

  identity.clear();
  try {
    const employeeId = await tickets.verify(ticket);
    identity.save(employeeId);
    return { employeeId, error: null, callbackValidated: true };
  } catch (error) {
    return {
      employeeId: null,
      error: error instanceof Error ? error : new Error("ESS login failed."),
      callbackValidated: true,
    };
  } finally {
    cleanCallbackUrl(url);
  }
}
