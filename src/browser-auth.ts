import { EssAuthClient } from "./client.js";
import { EssAuthError } from "./errors.js";
import { defaultStorage } from "./storage.js";
import type { StorageLike } from "./types.js";

const DEFAULT_API_URL = "http://127.0.0.1:8000/api/v1";
const DEFAULT_LOGIN_URL = "http://127.0.0.1:5173/client-auth/login";
const DEFAULT_STORAGE_KEY = "ess-auth-o1.client-identity.v1";

type StoredIdentity = {
  employeeId: string;
  publicKey: string;
};

export interface EssAuthInitOptions {
  publicKey: string;
  /** Override only when testing locally or using a self-hosted ESS API. */
  apiUrl?: string;
  /** Override only when testing locally or using a self-hosted ESS login page. */
  loginUrl?: string;
  /** Defaults to sessionStorage. */
  storage?: StorageLike | null;
  storageKey?: string;
  /** Injectable transport for tests and non-standard browser environments. */
  fetch?: typeof globalThis.fetch;
}

function requiredPublicKey(value: string): string {
  const publicKey = value.trim();
  if (!publicKey) {
    throw new EssAuthError("A registered client public key is required.", {
      code: "CLIENT_PUBLIC_KEY_REQUIRED",
    });
  }
  return publicKey;
}

function browserUrl(): URL {
  if (typeof globalThis.location === "undefined") {
    throw new EssAuthError("EssAuth redirect login requires a browser.", {
      code: "BROWSER_REQUIRED",
    });
  }
  return new URL(globalThis.location.href);
}

/**
 * Minimal redirect-based client authentication API.
 *
 * Client applications call only `init`, `login`, and `logout`. Ticket parsing,
 * verification, callback cleanup, and identity persistence stay inside the SDK.
 */
export class EssAuth {
  employeeId: string | null = null;
  error: Error | null = null;

  private readonly publicKey: string;
  private readonly loginUrl: string;
  private readonly storage: StorageLike;
  private readonly storageKey: string;
  private readonly client: EssAuthClient;

  private constructor(options: EssAuthInitOptions) {
    this.publicKey = requiredPublicKey(options.publicKey);
    this.loginUrl = options.loginUrl?.trim() || DEFAULT_LOGIN_URL;
    this.storage = options.storage ?? defaultStorage();
    this.storageKey = options.storageKey?.trim() || `${DEFAULT_STORAGE_KEY}.${this.publicKey}`;
    this.client = new EssAuthClient({
      baseUrl: options.apiUrl?.trim() || DEFAULT_API_URL,
      publicKey: this.publicKey,
      storage: null,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  static async init(options: EssAuthInitOptions): Promise<EssAuth> {
    const auth = new EssAuth(options);
    await auth.initialize();
    return auth;
  }

  login(): void {
    this.clearIdentity();

    const callback = browserUrl();
    callback.searchParams.delete("ticket");

    const login = new URL(this.loginUrl);
    login.searchParams.set("public_key", this.publicKey);
    login.searchParams.set("return_to", callback.toString());
    globalThis.location.assign(login.toString());
  }

  logout(): void {
    this.clearIdentity();
  }

  private async initialize(): Promise<void> {
    const url = browserUrl();
    const ticket = url.searchParams.get("ticket");

    if (!ticket) {
      this.restoreIdentity();
      return;
    }

    this.clearIdentity();
    try {
      const result = await this.client.verifyTicket(ticket);
      this.employeeId = result.employee_id;
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({ employeeId: result.employee_id, publicKey: this.publicKey }),
      );
    } catch (error) {
      this.error = error instanceof Error ? error : new Error("ESS login failed.");
    } finally {
      url.searchParams.delete("ticket");
      globalThis.history.replaceState(globalThis.history.state, "", url.toString());
    }
  }

  private restoreIdentity(): void {
    const stored = this.storage.getItem(this.storageKey);
    if (!stored) return;

    try {
      const identity = JSON.parse(stored) as Partial<StoredIdentity>;
      if (
        identity.publicKey !== this.publicKey
        || typeof identity.employeeId !== "string"
        || !identity.employeeId.trim()
      ) {
        throw new Error("Invalid stored identity");
      }
      this.employeeId = identity.employeeId;
    } catch {
      this.storage.removeItem(this.storageKey);
    }
  }

  private clearIdentity(): void {
    this.employeeId = null;
    this.error = null;
    this.storage.removeItem(this.storageKey);
  }
}

export default EssAuth;
