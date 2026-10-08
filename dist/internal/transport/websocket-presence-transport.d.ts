import type { PresenceTransport } from "./presence-transport.js";
export declare class WebSocketPresenceTransport implements PresenceTransport {
    #private;
    constructor(apiUrl: string, webSocketConstructor: typeof WebSocket | null, heartbeatIntervalMs?: number, reconnectDelayMs?: number);
    connect(publicKey: string): void;
    disconnect(): void;
}
//# sourceMappingURL=websocket-presence-transport.d.ts.map