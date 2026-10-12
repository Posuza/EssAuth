class MemoryStorage {
    #values = new Map();
    getItem(key) {
        return this.#values.get(key) ?? null;
    }
    setItem(key, value) {
        this.#values.set(key, value);
    }
    removeItem(key) {
        this.#values.delete(key);
    }
}
function browserStorage(name) {
    try {
        return globalThis[name] ?? null;
    }
    catch {
        return null;
    }
}
function employeeIdFromValue(value) {
    try {
        const parsed = JSON.parse(value);
        return typeof parsed.employeeId === "string" && parsed.employeeId.trim()
            ? parsed.employeeId.trim()
            : null;
    }
    catch {
        return null;
    }
}
class BrowserIdentityStorage {
    #local;
    #session;
    constructor(local, session) {
        this.#local = local;
        this.#session = session;
    }
    getItem(key) {
        const activeKey = `${key}.active`;
        const activeEmployeeId = this.#session.getItem(activeKey)?.trim();
        if (activeEmployeeId) {
            const stored = this.#local.getItem(`${key}.${activeEmployeeId}`);
            if (stored)
                return stored;
            this.#session.removeItem(activeKey);
        }
        // Migrate the v1 tab-local record after the first v1.2 load.
        const legacy = this.#session.getItem(key);
        if (!legacy)
            return null;
        const employeeId = employeeIdFromValue(legacy);
        if (!employeeId) {
            this.#session.removeItem(key);
            return null;
        }
        this.setItem(key, legacy);
        return legacy;
    }
    setItem(key, value) {
        const employeeId = employeeIdFromValue(value);
        if (!employeeId)
            throw new Error("SDK identity requires an employee ID");
        this.#local.setItem(`${key}.${employeeId}`, value);
        this.#session.setItem(`${key}.active`, employeeId);
        this.#session.removeItem(key);
    }
    removeItem(key) {
        const activeKey = `${key}.active`;
        const employeeId = this.#session.getItem(activeKey)?.trim();
        if (employeeId)
            this.#local.removeItem(`${key}.${employeeId}`);
        this.#session.removeItem(activeKey);
        this.#session.removeItem(key);
    }
    subscribe(key, employeeId, onRemoved) {
        if (typeof globalThis.addEventListener !== "function")
            return () => { };
        const recordKey = `${key}.${employeeId}`;
        const listener = (event) => {
            if (event.storageArea !== globalThis.localStorage)
                return;
            if (event.key !== recordKey || event.newValue !== null)
                return;
            this.#session.removeItem(`${key}.active`);
            onRemoved();
        };
        globalThis.addEventListener("storage", listener);
        return () => globalThis.removeEventListener("storage", listener);
    }
}
export function defaultStorage() {
    const local = browserStorage("localStorage");
    const session = browserStorage("sessionStorage");
    if (local && session)
        return new BrowserIdentityStorage(local, session);
    return session ?? local ?? new MemoryStorage();
}
//# sourceMappingURL=browser-storage.js.map