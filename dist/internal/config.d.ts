import type { EssAuthInitOptions, StorageLike } from "../public/types.js";
export interface ResolvedEssAuthConfig {
    publicKey: string;
    apiUrl: string;
    loginUrl: string;
    storage: StorageLike;
    storageKey: string;
    fetcher: typeof globalThis.fetch;
}
export declare function resolveConfig(options: EssAuthInitOptions): ResolvedEssAuthConfig;
//# sourceMappingURL=config.d.ts.map