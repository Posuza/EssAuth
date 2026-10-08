import { initializeIdentity } from "../internal/auth/lifecycle.js";
import { CallbackService } from "../internal/auth/callback-service.js";
import { redirectToLogin } from "../internal/auth/redirect.js";
import { EssAuthError } from "../internal/core/errors.js";
import { TicketService } from "../internal/auth/ticket-service.js";
import { resolveConfig } from "../internal/core/config.js";
import { IdentityStore } from "../internal/storage/identity-store.js";
import { FetchTransport } from "../internal/transport/fetch-transport.js";
import type { PresenceTransport } from "../internal/transport/presence-transport.js";
import { WebSocketPresenceTransport } from "../internal/transport/websocket-presence-transport.js";
import type { EssAuthInitOptions } from "./types.js";

/** Public redirect-authentication facade for client applications. */
export class EssAuth {
  employeeId: string | null = null;
  error: Error | null = null;

  readonly #publicKey: string;
  readonly #loginUrl: string;
  readonly #identity: IdentityStore;
  readonly #tickets: TicketService;
  readonly #callbacks: CallbackService;
  readonly #presence: PresenceTransport;
  #callbackValidated = false;

  private constructor(options: EssAuthInitOptions) {
    const config = resolveConfig(options);
    this.#publicKey = config.publicKey;
    this.#loginUrl = config.loginUrl;
    this.#identity = new IdentityStore(
      config.storage,
      config.storageKey,
      config.publicKey,
    );
    const transport = new FetchTransport(config.apiUrl, config.fetcher);
    this.#tickets = new TicketService(config.publicKey, transport);
    this.#callbacks = new CallbackService(config.publicKey, transport);
    this.#presence = new WebSocketPresenceTransport(
      config.apiUrl,
      typeof globalThis.window !== "undefined"
        && typeof globalThis.WebSocket === "function"
        ? globalThis.WebSocket
        : null,
    );
  }

  static async init(options: EssAuthInitOptions): Promise<EssAuth> {
    const auth = new EssAuth(options);
    const result = await initializeIdentity(
      auth.#identity,
      auth.#tickets,
      auth.#callbacks,
    );
    auth.employeeId = result.employeeId;
    auth.error = result.error;
    auth.#callbackValidated = result.callbackValidated;
    if (result.callbackValidated) auth.#presence.connect(auth.#publicKey);
    return auth;
  }

  login(): void {
    if (!this.#callbackValidated) {
      const error = new EssAuthError(
        "ESS login is unavailable because this client application was not validated.",
        { code: "CLIENT_VALIDATION_REQUIRED" },
      );
      this.error = error;
      throw error;
    }
    this.#clearIdentity();
    redirectToLogin(this.#loginUrl, this.#publicKey);
  }

  async logout(): Promise<void> {
    const employeeId = this.employeeId;
    this.#clearIdentity();
    if (!employeeId) return;
    await this.#tickets.notifyLogout(employeeId);
  }

  #clearIdentity(): void {
    this.employeeId = null;
    this.error = null;
    this.#identity.clear();
  }
}

export default EssAuth;
