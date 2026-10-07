export interface RequestOptions {
    fallbackError: string;
    keepalive?: boolean;
}
/** Request/response capability used by ESS endpoint services. */
export interface RequestTransport {
    post<T>(path: string, body: Record<string, string>, options: RequestOptions): Promise<T>;
}
//# sourceMappingURL=request-transport.d.ts.map