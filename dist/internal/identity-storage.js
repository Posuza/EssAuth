export class IdentityStorage {
    #publicKey;
    #storage;
    #storageKey;
    constructor(storage, storageKey, publicKey) {
        this.#storage = storage;
        this.#storageKey = storageKey;
        this.#publicKey = publicKey;
    }
    restore() {
        const stored = this.#storage.getItem(this.#storageKey);
        if (!stored)
            return null;
        try {
            const identity = JSON.parse(stored);
            if (identity.publicKey !== this.#publicKey
                || typeof identity.employeeId !== "string"
                || !identity.employeeId.trim()) {
                throw new Error("Invalid stored identity");
            }
            return identity.employeeId;
        }
        catch {
            this.clear();
            return null;
        }
    }
    save(employeeId) {
        this.#storage.setItem(this.#storageKey, JSON.stringify({ employeeId, publicKey: this.#publicKey }));
    }
    clear() {
        this.#storage.removeItem(this.#storageKey);
    }
}
//# sourceMappingURL=identity-storage.js.map