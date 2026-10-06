import { connectionError, EssAuthError, responseError } from "./errors.js";
import { defaultStorage, MemoryStorage } from "./storage.js";
const DEFAULT_STORAGE_KEY = "ess-auth-o1.session.v1";
const EMPLOYEE_CODE = /^[A-Za-z0-9]{6}$/;
function normalizeBaseUrl(value) {
    const normalized = value.trim().replace(/\/+$/, "");
    if (!normalized)
        throw new EssAuthError("baseUrl cannot be empty.", { code: "INVALID_BASE_URL" });
    return normalized;
}
function normalizeEmployeeCode(value) {
    const code = value.trim().toUpperCase();
    if (!EMPLOYEE_CODE.test(code)) {
        throw new EssAuthError("Employee code must contain exactly 6 letters or numbers.", {
            code: "INVALID_EMPLOYEE_CODE",
        });
    }
    return code;
}
function isEmployeeProfile(value) {
    if (!value || typeof value !== "object")
        return false;
    const employee = value;
    return typeof employee.employee_code === "string"
        && typeof employee.first_name === "string"
        && typeof employee.last_name === "string"
        && typeof employee.role_name === "string";
}
function isSession(value) {
    if (!value || typeof value !== "object")
        return false;
    const session = value;
    return session.version === 1
        && session.authMethod === "employee-code"
        && typeof session.authenticatedAt === "string"
        && isEmployeeProfile(session.employee);
}
export class EssAuthClient {
    baseUrl;
    storage;
    storageKey;
    fetcher;
    listeners = new Set();
    session = null;
    constructor(options = {}) {
        this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "/api/v1");
        this.storage = options.storage === null
            ? new MemoryStorage()
            : options.storage ?? defaultStorage();
        this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
        const fetcher = options.fetch ?? globalThis.fetch;
        if (typeof fetcher !== "function") {
            throw new EssAuthError("A fetch implementation is required.", { code: "FETCH_REQUIRED" });
        }
        this.fetcher = fetcher.bind(globalThis);
    }
    start() {
        const stored = this.storage.getItem(this.storageKey);
        if (!stored)
            return null;
        try {
            const session = JSON.parse(stored);
            if (!isSession(session))
                throw new Error("Invalid session shape");
            this.session = session;
            return session;
        }
        catch {
            this.storage.removeItem(this.storageKey);
            return null;
        }
    }
    getSession() {
        return this.session;
    }
    getUser() {
        return this.session?.employee ?? null;
    }
    isAuthenticated() {
        return this.session !== null;
    }
    onAuthStateChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    async login(credentials) {
        const employeeCode = normalizeEmployeeCode(credentials.employeeCode);
        const result = await this.json("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee_code: employeeCode, password: credentials.password }),
        }, false, "Login failed.");
        if (!isEmployeeProfile(result.employee)) {
            throw new EssAuthError("The server returned an incomplete employee profile.", {
                code: "INVALID_LOGIN_RESPONSE",
                details: result,
            });
        }
        const session = {
            version: 1,
            employee: result.employee,
            authenticatedAt: new Date().toISOString(),
            authMethod: "employee-code",
        };
        this.setSession(session);
        return session;
    }
    async logout() {
        const employeeCode = this.session?.employee.employee_code;
        if (!employeeCode)
            return null;
        try {
            return await this.json(`/auth/logout?employee_code=${encodeURIComponent(employeeCode)}`, { method: "POST" }, false, "Logout failed.");
        }
        finally {
            this.setSession(null);
        }
    }
    async request(path, init = {}) {
        return this.json(path, init, true, "ESS request failed.");
    }
    async lookupEmployee(employeeCode) {
        const code = normalizeEmployeeCode(employeeCode);
        return this.json(`/faces/employees/${encodeURIComponent(code)}`, { cache: "no-store" }, false, "Employee lookup failed.");
    }
    async getProfileImage(employeeCode) {
        const code = normalizeEmployeeCode(employeeCode);
        const response = await this.send(`/faces/${encodeURIComponent(code)}/profile-image`, { cache: "no-store" }, false);
        if (response.status === 404)
            return null;
        if (!response.ok)
            throw await responseError(response, "Profile image request failed.");
        return response.blob();
    }
    async verifyFace(input) {
        const employeeCode = normalizeEmployeeCode(input.employeeCode);
        return this.json("/faces/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee_code: employeeCode, image_data_url: input.imageDataUrl }),
        }, false, "Face verification failed.");
    }
    async enrollFace(input) {
        const employeeCode = normalizeEmployeeCode(input.employeeCode);
        const body = {
            employee_code: employeeCode,
            image_data_url: input.imageDataUrl,
            ...(input.createdBy !== undefined ? { created_by: input.createdBy } : {}),
        };
        return this.json("/faces/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }, true, "Face enrollment failed.");
    }
    setSession(session) {
        this.session = session;
        if (session)
            this.storage.setItem(this.storageKey, JSON.stringify(session));
        else
            this.storage.removeItem(this.storageKey);
        for (const listener of this.listeners)
            listener(session);
    }
    url(path) {
        if (/^https?:\/\//i.test(path)) {
            throw new EssAuthError("request() only accepts paths for the configured ESS API.", {
                code: "CROSS_ORIGIN_REQUEST",
            });
        }
        return `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
    }
    async send(path, init, authenticated) {
        const headers = new Headers(init.headers);
        if (authenticated) {
            const employeeCode = this.session?.employee.employee_code;
            if (!employeeCode) {
                throw new EssAuthError("An authenticated ESS session is required.", {
                    code: "AUTHENTICATION_REQUIRED",
                });
            }
            headers.set("X-Employee-Code", employeeCode);
        }
        try {
            return await this.fetcher(this.url(path), { ...init, headers });
        }
        catch (error) {
            throw connectionError(error);
        }
    }
    async json(path, init, authenticated, fallbackError) {
        const response = await this.send(path, init, authenticated);
        if (!response.ok)
            throw await responseError(response, fallbackError);
        if (response.status === 204)
            return undefined;
        return response.json();
    }
}
//# sourceMappingURL=client.js.map