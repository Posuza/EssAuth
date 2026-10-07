import type { StorageLike } from "../public/types.js";

class MemoryStorage implements StorageLike {
  readonly #values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }
}

export function defaultStorage(): StorageLike {
  try {
    if (typeof globalThis.sessionStorage !== "undefined") {
      return globalThis.sessionStorage;
    }
  } catch {
    // Browsers may deny storage access; an in-memory identity still works.
  }
  return new MemoryStorage();
}
