export interface PresenceTransport {
  connect(publicKey: string): void;
  disconnect(): void;
}
