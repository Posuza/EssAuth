import type { PresenceTransport } from "./presence-transport.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 5_000;

export class WebSocketPresenceTransport implements PresenceTransport {
  readonly #apiUrl: string;
  readonly #webSocketConstructor: typeof WebSocket | null;
  readonly #heartbeatIntervalMs: number;
  readonly #reconnectDelayMs: number;

  #active = false;
  #publicKey = "";
  #socket: WebSocket | null = null;
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    apiUrl: string,
    webSocketConstructor: typeof WebSocket | null,
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
    reconnectDelayMs = RECONNECT_DELAY_MS,
  ) {
    this.#apiUrl = apiUrl;
    this.#webSocketConstructor = webSocketConstructor;
    this.#heartbeatIntervalMs = heartbeatIntervalMs;
    this.#reconnectDelayMs = reconnectDelayMs;
  }

  connect(publicKey: string): void {
    this.disconnect();
    if (!this.#webSocketConstructor) return;

    this.#active = true;
    this.#publicKey = publicKey;
    this.#openSocket();
  }

  disconnect(): void {
    this.#active = false;
    this.#clearHeartbeatTimer();
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }

    const socket = this.#socket;
    this.#socket = null;
    if (socket && socket.readyState < 2) socket.close(1000, "Client stopped");
  }

  #openSocket(): void {
    if (!this.#active || !this.#webSocketConstructor) return;

    const url = new URL(this.#apiUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/client-auth/presence/ws`;
    url.search = "";
    url.searchParams.set("public_key", this.#publicKey);

    const socket = new this.#webSocketConstructor(url);
    this.#socket = socket;
    socket.onopen = () => {
      if (!this.#active || this.#socket !== socket) return;
      this.#sendHeartbeat(socket);
      this.#heartbeatTimer = setInterval(
        () => this.#sendHeartbeat(socket),
        this.#heartbeatIntervalMs,
      );
    };
    socket.onerror = () => {
      // Browsers emit a close event after a connection error; reconnect there.
    };
    socket.onclose = () => {
      if (this.#socket === socket) this.#socket = null;
      this.#clearHeartbeatTimer();
      if (!this.#active) return;
      this.#reconnectTimer = setTimeout(() => {
        this.#reconnectTimer = null;
        this.#openSocket();
      }, this.#reconnectDelayMs);
    };
  }

  #sendHeartbeat(socket: WebSocket): void {
    if (this.#socket !== socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify({ type: "heartbeat" }));
  }

  #clearHeartbeatTimer(): void {
    if (this.#heartbeatTimer === null) return;
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
  }
}
