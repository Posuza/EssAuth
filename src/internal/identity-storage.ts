import type { StorageLike } from "../public/types.js";

type StoredIdentity = {
  employeeId: string;
  publicKey: string;
};

export class IdentityStorage {
  readonly #publicKey: string;
  readonly #storage: StorageLike;
  readonly #storageKey: string;

  constructor(storage: StorageLike, storageKey: string, publicKey: string) {
    this.#storage = storage;
    this.#storageKey = storageKey;
    this.#publicKey = publicKey;
  }

  restore(): string | null {
    const stored = this.#storage.getItem(this.#storageKey);
    if (!stored) return null;

    try {
      const identity = JSON.parse(stored) as Partial<StoredIdentity>;
      if (
        identity.publicKey !== this.#publicKey
        || typeof identity.employeeId !== "string"
        || !identity.employeeId.trim()
      ) {
        throw new Error("Invalid stored identity");
      }
      return identity.employeeId;
    } catch {
      this.clear();
      return null;
    }
  }

  save(employeeId: string): void {
    this.#storage.setItem(
      this.#storageKey,
      JSON.stringify({ employeeId, publicKey: this.#publicKey }),
    );
  }

  clear(): void {
    this.#storage.removeItem(this.#storageKey);
  }
}
