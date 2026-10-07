export declare class EssAuthError extends Error {
    readonly code: string;
    readonly status: number | null;
    readonly details: unknown;
    constructor(message: string, options?: {
        code?: string;
        status?: number | null;
        details?: unknown;
    });
}
export declare function responseError(response: Response, fallback: string): Promise<EssAuthError>;
export declare function connectionError(cause: unknown): EssAuthError;
//# sourceMappingURL=errors.d.ts.map