import { EssAuthClient } from "./client.js";
import { EssAuthError } from "./errors.js";
let client = null;
function configuredClient() {
    if (!client) {
        throw new EssAuthError("Call start() before using the default EssAuth client.", {
            code: "SDK_NOT_STARTED",
        });
    }
    return client;
}
export function start(options = {}) {
    if (!client) {
        client = new EssAuthClient(options);
        client.start();
    }
    return client;
}
export function getClient() {
    return configuredClient();
}
export function login(credentials) {
    return configuredClient().login(credentials);
}
export function logout() {
    return configuredClient().logout();
}
export function getUser() {
    return configuredClient().getUser();
}
export function getSession() {
    return configuredClient().getSession();
}
export function verifyTicket(ticket) {
    return configuredClient().verifyTicket(ticket);
}
//# sourceMappingURL=singleton.js.map