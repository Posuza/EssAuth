import { resolveConfig } from "../internal/config.js";
import { IdentityStorage } from "../internal/identity-storage.js";
import { initializeIdentity } from "../internal/lifecycle.js";
import { redirectToLogin } from "../internal/redirect.js";
import { TicketService } from "../internal/ticket.js";
import { JsonTransport } from "../internal/transport.js";
import type { EssAuthInitOptions } from "./types.js";

/** Public redirect-authentication facade for client applications. */
export class EssAuth {
  employeeId: string | null = null;
  error: Error | null = null;

  readonly #publicKey: string;
  readonly #loginUrl: string;
  readonly #identity: IdentityStorage;
  readonly #tickets: TicketService;

  private constructor(options: EssAuthInitOptions) {
    const config = resolveConfig(options);
    this.#publicKey = config.publicKey;
    this.#loginUrl = config.loginUrl;
    this.#identity = new IdentityStorage(
      config.storage,
      config.storageKey,
      config.publicKey,
    );
    this.#tickets = new TicketService(
      config.publicKey,
      new JsonTransport(config.apiUrl, config.fetcher),
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
