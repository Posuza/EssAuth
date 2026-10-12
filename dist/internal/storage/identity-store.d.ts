import type { StorageLike } from "../../public/types.js";
export declare class IdentityStore {
    #private;
    constructor(storage: StorageLike, storageKey: string, publicKey: string);
    restore(): string | null;
    save(employeeId: string): void;
    clear(): void;
    onRemoved(employeeId: string, listener: () => void): () => void;
}
//# sourceMappingURL=identity-store.d.ts.map