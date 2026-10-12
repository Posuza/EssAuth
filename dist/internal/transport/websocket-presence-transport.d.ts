import type { PresenceIdentity, PresenceTransport } from "./presence-transport.js";
type PresenceLockManager = {
    request(name: string, options: {
        signal: AbortSignal;
    }, callback: () => Promise<void>): Promise<void>;
};
export declare class WebSocketPresenceTransport implements PresenceTransport {
    #private;
    constructor(apiUrl: string, webSocketConstructor: typeof WebSocket | null, heartbeatIntervalMs?: number, reconnectDelayMs?: number, lockManager?: PresenceLockManager | null);
    connect(identity: PresenceIdentity): void;
    disconnect(): void;
}
export {};
//# sourceMappingURL=websocket-presence-transport.d.ts.map