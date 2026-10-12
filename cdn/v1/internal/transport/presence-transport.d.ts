export type PresenceIdentity = {
    publicKey: string;
    employeeId: string;
    deviceId: string;
};
export interface PresenceTransport {
    connect(identity: PresenceIdentity): void;
    disconnect(): void;
}
//# sourceMappingURL=presence-transport.d.ts.map