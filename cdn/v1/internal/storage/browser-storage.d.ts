import type { StorageLike } from "../../public/types.js";
export interface CoordinatedIdentityStorage extends StorageLike {
    subscribe(key: string, employeeId: string, onRemoved: () => void): () => void;
}
export declare function defaultStorage(): StorageLike;
//# sourceMappingURL=browser-storage.d.ts.map