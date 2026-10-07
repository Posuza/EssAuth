import { EssAuthClient } from "./client.js";
import { EssAuthError } from "./errors.js";
import { defaultStorage } from "./storage.js";
const DEFAULT_API_URL = "https://essauth.localhost/api/v1";
const DEFAULT_LOGIN_URL = "https://essauth.localhost/client-auth/login";
const DEFAULT_STORAGE_KEY = "ess-auth-o1.client-identity.v1";
function requiredPublicKey(value) {
    const publicKey = value.trim();
    if (!publicKey) {
        throw new EssAuthError("A registered client public key is required.", {
            code: "CLIENT_PUBLIC_KEY_REQUIRED",
        });
    }
    return publicKey;
}
function browserUrl() {
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
    employeeId = null;
    error = null;
    publicKey;
    loginUrl;
    storage;
    storageKey;
    client;
    constructor(options) {
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
    static async init(options) {
        const auth = new EssAuth(options);
        await auth.initialize();
        return auth;
    }
    login() {
        this.clearIdentity();
        const callback = browserUrl();
        callback.searchParams.delete("ticket");
        const login = new URL(this.loginUrl);
        login.searchParams.set("public_key", this.publicKey);
        login.searchParams.set("return_to", callback.toString());
        globalThis.location.assign(login.toString());
    }
    async logout() {
        const employeeId = this.employeeId;
        this.clearIdentity();
        if (!employeeId)
            return;
        await this.client.notifyClientLogout(employeeId);
    }
    async initialize() {
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
            this.storage.setItem(this.storageKey, JSON.stringify({ employeeId: result.employee_id, publicKey: this.publicKey }));
        }
        catch (error) {
            this.error = error instanceof Error ? error : new Error("ESS login failed.");
        }
        finally {
            url.searchParams.delete("ticket");
            globalThis.history.replaceState(globalThis.history.state, "", url.toString());
        }
    }
    restoreIdentity() {
        const stored = this.storage.getItem(this.storageKey);
        if (!stored)
            return;
        try {
            const identity = JSON.parse(stored);
            if (identity.publicKey !== this.publicKey
                || typeof identity.employeeId !== "string"
                || !identity.employeeId.trim()) {
                throw new Error("Invalid stored identity");
            }
            this.employeeId = identity.employeeId;
        }
        catch {
            this.storage.removeItem(this.storageKey);
        }
    }
    clearIdentity() {
        this.employeeId = null;
        this.error = null;
        this.storage.removeItem(this.storageKey);
    }
}
export default EssAuth;
//# sourceMappingURL=browser-auth.js.map