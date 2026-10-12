import { initializeIdentity } from "../internal/auth/lifecycle.js";
import { CallbackService } from "../internal/auth/callback-service.js";
import { redirectToLogin } from "../internal/auth/redirect.js";
import { EssAuthError } from "../internal/core/errors.js";
import { TicketService } from "../internal/auth/ticket-service.js";
import { resolveConfig } from "../internal/core/config.js";
import { IdentityStore } from "../internal/storage/identity-store.js";
import { createPresenceIdentity } from "../internal/storage/presence-identity.js";
import { FetchTransport } from "../internal/transport/fetch-transport.js";
import { WebSocketPresenceTransport } from "../internal/transport/websocket-presence-transport.js";
const PRESENCE_SETTINGS_REFRESH_MS = 60_000;
/** Public redirect-authentication facade for client applications. */
export class EssAuth {
    employeeId = null;
    error = null;
    #publicKey;
    #loginUrl;
    #identity;
    #tickets;
    #callbacks;
    #presence;
    #apiUrl;
    #fetcher;
    #callbackValidated = false;
    #unsubscribeIdentity = null;
    #presenceIdentity = null;
    #presenceEnabled = null;
    #presenceSettingsTimer = null;
    constructor(options) {
        const config = resolveConfig(options);
        this.#publicKey = config.publicKey;
        this.#loginUrl = config.loginUrl;
        this.#apiUrl = config.apiUrl;
        this.#fetcher = config.fetcher;
        this.#identity = new IdentityStore(config.storage, config.storageKey, config.publicKey);
        const transport = new FetchTransport(config.apiUrl, config.fetcher);
        this.#tickets = new TicketService(config.publicKey, transport);
        this.#callbacks = new CallbackService(config.publicKey, transport);
        this.#presence = new WebSocketPresenceTransport(config.apiUrl, typeof globalThis.window !== "undefined"
            && typeof globalThis.WebSocket === "function"
            ? globalThis.WebSocket
            : null);
    }
    static async init(options) {
        const auth = new EssAuth(options);
        const result = await initializeIdentity(auth.#identity, auth.#tickets, auth.#callbacks);
        auth.employeeId = result.employeeId;
        auth.error = result.error;
        auth.#callbackValidated = result.callbackValidated;
        if (result.callbackValidated && result.employeeId) {
            auth.#startPresenceMonitoring(result.employeeId);
            auth.#unsubscribeIdentity = auth.#identity.onRemoved(result.employeeId, () => auth.#handleRemoteLogout());
        }
        return auth;
    }
    login() {
        if (!this.#callbackValidated) {
            const error = new EssAuthError("ESS login is unavailable because this client application was not validated.", { code: "CLIENT_VALIDATION_REQUIRED" });
            this.error = error;
            throw error;
        }
        this.#stopPresenceMonitoring();
        this.#clearIdentity();
        redirectToLogin(this.#loginUrl, this.#publicKey);
    }
    async logout() {
        const employeeId = this.employeeId;
        this.#stopPresenceMonitoring();
        this.#clearIdentity();
        if (!employeeId)
            return;
        try {
            await this.#tickets.notifyLogout(employeeId);
        }
        catch {
            // Logout is local-first. ESS notification is operational and must not
            // keep a client signed in when the central service is unavailable.
        }
    }
    #clearIdentity() {
        this.#unsubscribeIdentity?.();
        this.#unsubscribeIdentity = null;
        this.employeeId = null;
        this.error = null;
        this.#identity.clear();
    }
    #handleRemoteLogout() {
        this.#unsubscribeIdentity?.();
        this.#unsubscribeIdentity = null;
        this.#stopPresenceMonitoring();
        this.employeeId = null;
        this.error = null;
        if (typeof globalThis.location?.reload === "function") {
            globalThis.location.reload();
        }
    }
    #startPresenceMonitoring(employeeId) {
        this.#presenceIdentity = createPresenceIdentity(this.#publicKey, employeeId);
        void this.#syncPresenceMonitoring();
        this.#presenceSettingsTimer = setInterval(() => void this.#syncPresenceMonitoring(), PRESENCE_SETTINGS_REFRESH_MS);
    }
    #stopPresenceMonitoring() {
        if (this.#presenceSettingsTimer !== null) {
            clearInterval(this.#presenceSettingsTimer);
            this.#presenceSettingsTimer = null;
        }
        this.#presenceIdentity = null;
        this.#presenceEnabled = null;
        this.#presence.disconnect();
    }
    async #syncPresenceMonitoring() {
        if (!this.#presenceIdentity)
            return;
        let enabled = false;
        try {
            const response = await this.#fetcher(`${this.#apiUrl}/client-auth/presence/settings`, { method: "GET", cache: "no-store" });
            const settings = await response.json();
            enabled = response.ok && settings.enabled === true;
        }
        catch {
            // Presence is optional telemetry. A temporary ESS failure must never
            // interrupt an authenticated client application.
        }
        if (enabled === this.#presenceEnabled)
            return;
        this.#presenceEnabled = enabled;
        if (enabled) {
            this.#presence.connect(this.#presenceIdentity);
        }
        else {
            this.#presence.disconnect();
        }
    }
}
export default EssAuth;
//# sourceMappingURL=ess-auth.js.map