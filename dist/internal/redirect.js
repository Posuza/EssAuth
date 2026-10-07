import { EssAuthError } from "./errors.js";
export function browserUrl() {
    if (typeof globalThis.location === "undefined") {
        throw new EssAuthError("EssAuth redirect login requires a browser.", {
            code: "BROWSER_REQUIRED",
        });
    }
    return new URL(globalThis.location.href);
}
export function redirectToLogin(loginUrl, publicKey) {
    const callback = browserUrl();
    callback.searchParams.delete("ticket");
    const login = new URL(loginUrl);
    login.searchParams.set("public_key", publicKey);
    login.searchParams.set("return_to", callback.toString());
    globalThis.location.assign(login.toString());
}
export function callbackTicket(url) {
    return url.searchParams.get("ticket");
}
export function cleanCallbackUrl(url) {
    url.searchParams.delete("ticket");
    globalThis.history.replaceState(globalThis.history.state, "", url.toString());
}
//# sourceMappingURL=redirect.js.map