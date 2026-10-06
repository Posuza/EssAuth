import type { StorageLike } from "./types.js";
export declare class MemoryStorage implements StorageLike {
    private readonly values;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export declare function defaultStorage(): StorageLike;
//# sourceMappingURL=storage.d.ts.map