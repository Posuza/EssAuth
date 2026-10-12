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
    #callbackValidated = false;
    #unsubscribeIdentity = null;
    constructor(options) {
        const config = resolveConfig(options);
        this.#publicKey = config.publicKey;
        this.#loginUrl = config.loginUrl;
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
            auth.#presence.connect(createPresenceIdentity(auth.#publicKey, result.employeeId));
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
        this.#presence.disconnect();
        this.#clearIdentity();
        redirectToLogin(this.#loginUrl, this.#publicKey);
    }
    async logout() {
        const employeeId = this.employeeId;
        this.#presence.disconnect();
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
        this.#presence.disconnect();
        this.employeeId = null;
        this.error = null;
        if (typeof globalThis.location?.reload === "function") {
            globalThis.location.reload();
        }
    }
}
export default EssAuth;
//# sourceMappingURL=ess-auth.js.map