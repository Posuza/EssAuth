import type { RequestOptions, RequestTransport } from "./request-transport.js";
export declare class FetchTransport implements RequestTransport {
    #private;
    constructor(baseUrl: string, fetcher: typeof globalThis.fetch);
    post<T>(path: string, body: Record<string, string>, options: RequestOptions): Promise<T>;
}
//# sourceMappingURL=fetch-transport.d.ts.map