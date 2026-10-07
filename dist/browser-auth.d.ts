import type { StorageLike } from "./types.js";
export interface EssAuthInitOptions {
    publicKey: string;
    /** Override only when testing locally or using a self-hosted ESS API. */
    apiUrl?: string;
    /** Override only when testing locally or using a self-hosted ESS login page. */
    loginUrl?: string;
    /** Defaults to sessionStorage. */
    storage?: StorageLike | null;
    storageKey?: string;
    /** Injectable transport for tests and non-standard browser environments. */
    fetch?: typeof globalThis.fetch;
}
/**
 * Minimal redirect-based client authentication API.
 *
 * Client applications call only `init`, `login`, and `logout`. Ticket parsing,
 * verification, callback cleanup, and identity persistence stay inside the SDK.
 */
export declare class EssAuth {
    employeeId: string | null;
    error: Error | null;
    private readonly publicKey;
    private readonly loginUrl;
    private readonly storage;
    private readonly storageKey;
    private readonly client;
    private constructor();
    static init(options: EssAuthInitOptions): Promise<EssAuth>;
    login(): void;
    logout(): void;
    private initialize;
    private restoreIdentity;
    private clearIdentity;
}
export default EssAuth;
//# sourceMappingURL=browser-auth.d.ts.map