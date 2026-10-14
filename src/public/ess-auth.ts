import { initializeIdentity } from "../internal/auth/lifecycle.js";
import { CallbackService } from "../internal/auth/callback-service.js";
import { redirectToLogin } from "../internal/auth/redirect.js";
import { EssAuthError } from "../internal/core/errors.js";
import { TicketService } from "../internal/auth/ticket-service.js";
import { resolveConfig } from "../internal/core/config.js";
import { IdentityStore } from "../internal/storage/identity-store.js";
import { createPresenceIdentity } from "../internal/storage/presence-identity.js";
import { FetchTransport } from "../internal/transport/fetch-transport.js";
import type { PresenceTransport } from "../internal/transport/presence-transport.js";
import { WebSocketPresenceTransport } from "../internal/transport/websocket-presence-transport.js";
import type { EssAuthInitOptions } from "./types.js";

const PRESENCE_SETTINGS_REFRESH_MS = 60_000;

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
  readonly #apiUrl: string;
  readonly #fetcher: typeof globalThis.fetch;
  #callbackValidated = false;
  #unsubscribeIdentity: (() => void) | null = null;
  #presenceIdentity: ReturnType<typeof createPresenceIdentity> | null = null;
  #presenceEnabled: boolean | null = null;
  #presenceSettingsTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(options: EssAuthInitOptions) {
    const config = resolveConfig(options);
    this.#publicKey = config.publicKey;
    this.#loginUrl = config.loginUrl;
    this.#apiUrl = config.apiUrl;
    this.#fetcher = config.fetcher;
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
    if (result.callbackValidated && result.employeeId) {
      auth.#startPresenceMonitoring(result.employeeId);
      auth.#unsubscribeIdentity = auth.#identity.onRemoved(
        result.employeeId,
        () => auth.#handleRemoteLogout(),
      );
    }
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
    this.#stopPresenceMonitoring();
    this.#clearIdentity();
    redirectToLogin(this.#loginUrl, this.#publicKey);
  }

  async logout(): Promise<void> {
    const employeeId = this.employeeId;
    this.#stopPresenceMonitoring();
    this.#clearIdentity();
    if (!employeeId) return;
    try {
      await this.#tickets.notifyLogout(employeeId);
    } catch {
      // Logout is local-first. ESS notification is operational and must not
      // keep a client signed in when the central service is unavailable.
    }
  }

  #clearIdentity(): void {
    this.#unsubscribeIdentity?.();
    this.#unsubscribeIdentity = null;
    this.employeeId = null;
    this.error = null;
    this.#identity.clear();
  }

  #handleRemoteLogout(): void {
    this.#unsubscribeIdentity?.();
    this.#unsubscribeIdentity = null;
    this.#stopPresenceMonitoring();
    this.employeeId = null;
    this.error = null;
    if (typeof globalThis.location?.reload === "function") {
      globalThis.location.reload();
    }
  }

  #startPresenceMonitoring(employeeId: string): void {
    this.#presenceIdentity = createPresenceIdentity(this.#publicKey, employeeId);
    this.#presenceEnabled = true;
    this.#presence.connect(this.#presenceIdentity);
    void this.#syncPresenceMonitoring();
    this.#presenceSettingsTimer = setInterval(
      () => void this.#syncPresenceMonitoring(),
      PRESENCE_SETTINGS_REFRESH_MS,
    );
  }

  #stopPresenceMonitoring(): void {
    if (this.#presenceSettingsTimer !== null) {
      clearInterval(this.#presenceSettingsTimer);
      this.#presenceSettingsTimer = null;
    }
    this.#presenceIdentity = null;
    this.#presenceEnabled = null;
    this.#presence.disconnect();
  }

  async #syncPresenceMonitoring(): Promise<void> {
    if (!this.#presenceIdentity) return;
    let enabled: boolean;
    try {
      const response = await this.#fetcher(
        `${this.#apiUrl}/client-auth/presence/settings`,
        { method: "GET", cache: "no-store" },
      );
      const settings = await response.json() as { enabled?: unknown };
      enabled = response.ok && settings.enabled === true;
    } catch {
      // Presence is optional telemetry. A temporary ESS failure must never
      // interrupt authentication or tear down an existing live connection.
      return;
    }

    if (enabled === this.#presenceEnabled) return;
    this.#presenceEnabled = enabled;
    if (enabled) {
      this.#presence.connect(this.#presenceIdentity);
    } else {
      this.#presence.disconnect();
    }
  }
}

export default EssAuth;
