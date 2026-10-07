import { EssAuthError } from "./errors.js";
import { defaultStorage } from "../storage/browser-storage.js";
const DEFAULT_API_URL = "https://essauth.localhost/api/v1";
const DEFAULT_LOGIN_URL = "https://essauth.localhost/client-auth/login";
const DEFAULT_STORAGE_KEY = "ess-auth-o1.client-identity.v1";
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{16}$/;
function normalizedUrl(value, name) {
    const normalized = value.trim().replace(/\/+$/, "");
    if (!normalized) {
        throw new EssAuthError(`${name} cannot be empty.`, { code: "INVALID_CONFIG" });
    }
    try {
        return new URL(normalized).toString().replace(/\/+$/, "");
    }
    catch {
        throw new EssAuthError(`${name} must be a valid URL.`, { code: "INVALID_CONFIG" });
    }
}
export function resolveConfig(options) {
    const publicKey = options.publicKey.trim();
    if (!PUBLIC_KEY_PATTERN.test(publicKey)) {
        throw new EssAuthError("The registered client public key must contain exactly 16 URL-safe characters.", { code: "INVALID_CLIENT_PUBLIC_KEY" });
    }
    const fetcher = options.fetch ?? globalThis.fetch;
    if (typeof fetcher !== "function") {
        throw new EssAuthError("A fetch implementation is required.", {
            code: "FETCH_REQUIRED",
        });
    }
    return {
        publicKey,
        apiUrl: normalizedUrl(options.apiUrl ?? DEFAULT_API_URL, "apiUrl"),
        loginUrl: normalizedUrl(options.loginUrl ?? DEFAULT_LOGIN_URL, "loginUrl"),
        storage: options.storage ?? defaultStorage(),
        storageKey: options.storageKey?.trim() || `${DEFAULT_STORAGE_KEY}.${publicKey}`,
        fetcher,
    };
}
//# sourceMappingURL=config.js.map