import { resolveConfig } from "../internal/config.js";
import { IdentityStorage } from "../internal/identity-storage.js";
import { initializeIdentity } from "../internal/lifecycle.js";
import { redirectToLogin } from "../internal/redirect.js";
import { TicketService } from "../internal/ticket.js";
import { JsonTransport } from "../internal/transport.js";
/** Public redirect-authentication facade for client applications. */
export class EssAuth {
    employeeId = null;
    error = null;
    #publicKey;
    #loginUrl;
    #identity;
    #tickets;
    constructor(options) {
        const config = resolveConfig(options);
        this.#publicKey = config.publicKey;
        this.#loginUrl = config.loginUrl;
        this.#identity = new IdentityStorage(config.storage, config.storageKey, config.publicKey);
        this.#tickets = new TicketService(config.publicKey, new JsonTransport(config.apiUrl, config.fetcher));
    }
    static async init(options) {
        const auth = new EssAuth(options);
        const result = await initializeIdentity(auth.#identity, auth.#tickets);
        auth.employeeId = result.employeeId;
        auth.error = result.error;
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