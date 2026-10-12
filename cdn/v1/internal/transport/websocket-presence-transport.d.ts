import type { PresenceIdentity, PresenceTransport } from "./presence-transport.js";
type PresenceGeolocation = Pick<Geolocation, "watchPosition" | "clearWatch">;
type PresenceLockManager = {
    request(name: string, options: {
        signal: AbortSignal;
    }, callback: () => Promise<void>): Promise<void>;
};
export declare class WebSocketPresenceTransport implements PresenceTransport {
    #private;
    constructor(apiUrl: string, webSocketConstructor: typeof WebSocket | null, heartbeatIntervalMs?: number, reconnectDelayMs?: number, lockManager?: PresenceLockManager | null, geolocation?: PresenceGeolocation | null);
    connect(identity: PresenceIdentity): void;
    disconnect(): void;
}
export {};
//# sourceMappingURL=websocket-presence-transport.d.ts.map