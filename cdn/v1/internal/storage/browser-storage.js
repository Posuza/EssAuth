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
export function defaultStorage() {
    try {
        if (typeof globalThis.sessionStorage !== "undefined") {
            return globalThis.sessionStorage;
        }
    }
    catch {
        // Browsers may deny storage access; an in-memory identity still works.
    }
    return new MemoryStorage();
}
//# sourceMappingURL=browser-storage.js.map