import type { StorageLike } from "../public/types.js";
export declare class IdentityStorage {
    #private;
    constructor(storage: StorageLike, storageKey: string, publicKey: string);
    restore(): string | null;
    save(employeeId: string): void;
    clear(): void;
}
//# sourceMappingURL=identity-storage.d.ts.map