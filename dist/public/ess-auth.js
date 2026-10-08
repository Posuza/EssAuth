import { initializeIdentity } from "../internal/auth/lifecycle.js";
import { redirectToLogin } from "../internal/auth/redirect.js";
import { TicketService } from "../internal/auth/ticket-service.js";
import { resolveConfig } from "../internal/core/config.js";
import { IdentityStore } from "../internal/storage/identity-store.js";
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
    #presence;
    constructor(options) {
        const config = resolveConfig(options);
        this.#publicKey = config.publicKey;
        this.#loginUrl = config.loginUrl;
        this.#identity = new IdentityStore(config.storage, config.storageKey, config.publicKey);
        this.#tickets = new TicketService(config.publicKey, new FetchTransport(config.apiUrl, config.fetcher));
        this.#presence = new WebSocketPresenceTransport(config.apiUrl, typeof globalThis.window !== "undefined"
            && typeof globalThis.WebSocket === "function"
            ? globalThis.WebSocket
            : null);
    }
    static async init(options) {
        const auth = new EssAuth(options);
        const result = await initializeIdentity(auth.#identity, auth.#tickets);
        auth.employeeId = result.employeeId;
        auth.error = result.error;
        auth.#presence.connect(auth.#publicKey);
        return auth;
    }
    login() {
        this.#clearIdentity();
        redirectToLogin(this.#loginUrl, this.#publicKey);
    }
    async logout() {
        const employeeId = this.employeeId;
        this.#clearIdentity();
        if (!employeeId)
            return;
        await this.#tickets.notifyLogout(employeeId);
    }
    #clearIdentity() {
        this.employeeId = null;
        this.error = null;
        this.#identity.clear();
    }
}
export default EssAuth;
//# sourceMappingURL=ess-auth.js.map