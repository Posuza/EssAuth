import { initializeIdentity } from "../internal/auth/lifecycle.js";
import { redirectToLogin } from "../internal/auth/redirect.js";
import { TicketService } from "../internal/auth/ticket-service.js";
import { resolveConfig } from "../internal/core/config.js";
import { IdentityStore } from "../internal/storage/identity-store.js";
import { FetchTransport } from "../internal/transport/fetch-transport.js";
import type { EssAuthInitOptions } from "./types.js";

/** Public redirect-authentication facade for client applications. */
export class EssAuth {
  employeeId: string | null = null;
  error: Error | null = null;

  readonly #publicKey: string;
  readonly #loginUrl: string;
  readonly #identity: IdentityStore;
  readonly #tickets: TicketService;

  private constructor(options: EssAuthInitOptions) {
    const config = resolveConfig(options);
    this.#publicKey = config.publicKey;
    this.#loginUrl = config.loginUrl;
    this.#identity = new IdentityStore(
      config.storage,
      config.storageKey,
      config.publicKey,
    );
    this.#tickets = new TicketService(
      config.publicKey,
      new FetchTransport(config.apiUrl, config.fetcher),
    );
  }

  static async init(options: EssAuthInitOptions): Promise<EssAuth> {
    const auth = new EssAuth(options);
    const result = await initializeIdentity(auth.#identity, auth.#tickets);
    auth.employeeId = result.employeeId;
    auth.error = result.error;
    return auth;
  }

  login(): void {
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
