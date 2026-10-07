export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export interface EssAuthInitOptions {
    /** The mandatory 16-character identifier assigned by ESS. */
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
export interface AuthInitialization {
    employeeId: string | null;
    error: Error | null;
}
//# sourceMappingURL=types.d.ts.map