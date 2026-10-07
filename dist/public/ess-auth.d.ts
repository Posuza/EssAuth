import type { EssAuthInitOptions } from "./types.js";
/** Public redirect-authentication facade for client applications. */
export declare class EssAuth {
    #private;
    employeeId: string | null;
    error: Error | null;
    private constructor();
    static init(options: EssAuthInitOptions): Promise<EssAuth>;
    login(): void;
    logout(): Promise<void>;
}
export default EssAuth;
//# sourceMappingURL=ess-auth.d.ts.map