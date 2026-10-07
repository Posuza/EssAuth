export declare class JsonTransport {
    #private;
    constructor(baseUrl: string, fetcher: typeof globalThis.fetch);
    post<T>(path: string, body: Record<string, string>, fallbackError: string, keepalive?: boolean): Promise<T>;
}
//# sourceMappingURL=transport.d.ts.map