import type {
  PresenceIdentity,
  PresenceTransport,
} from "./presence-transport.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 5_000;

type PresenceLockManager = {
  request(
    name: string,
    options: { signal: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void>;
};

function defaultLockManager(): PresenceLockManager | null {
  try {
    return globalThis.navigator?.locks as PresenceLockManager | undefined ?? null;
  } catch {
    return null;
  }
}

export class WebSocketPresenceTransport implements PresenceTransport {
  readonly #apiUrl: string;
  readonly #webSocketConstructor: typeof WebSocket | null;
  readonly #heartbeatIntervalMs: number;
  readonly #reconnectDelayMs: number;
  readonly #lockManager: PresenceLockManager | null;

  #active = false;
  #identity: PresenceIdentity | null = null;
  #socket: WebSocket | null = null;
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #lockAbortController: AbortController | null = null;
  #releaseLock: (() => void) | null = null;
  #generation = 0;

  constructor(
    apiUrl: string,
    webSocketConstructor: typeof WebSocket | null,
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
    reconnectDelayMs = RECONNECT_DELAY_MS,
    lockManager: PresenceLockManager | null = defaultLockManager(),
  ) {
    this.#apiUrl = apiUrl;
    this.#webSocketConstructor = webSocketConstructor;
    this.#heartbeatIntervalMs = heartbeatIntervalMs;
    this.#reconnectDelayMs = reconnectDelayMs;
    this.#lockManager = lockManager;
  }

  connect(identity: PresenceIdentity): void {
    this.disconnect();
    if (!this.#webSocketConstructor) return;

    this.#active = true;
    this.#identity = identity;
    this.#startPresenceOwner();
  }

  disconnect(): void {
    this.#active = false;
    this.#generation++;
    this.#releaseLock?.();
    this.#releaseLock = null;
    this.#lockAbortController?.abort();
    this.#lockAbortController = null;
    this.#clearHeartbeatTimer();
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }

    const socket = this.#socket;
    this.#socket = null;
    this.#identity = null;
    if (socket && socket.readyState < 2) socket.close(1000, "Client stopped");
  }

  #startPresenceOwner(): void {
    if (!this.#active || !this.#identity) return;
    if (!this.#lockManager) {
      this.#openSocket();
      return;
    }

    const identity = this.#identity;
    const generation = ++this.#generation;
    const abortController = new AbortController();
    this.#lockAbortController = abortController;
    const lockName = [
      "ess-auth-o1.presence.v1",
      identity.publicKey,
      identity.employeeId,
      identity.deviceId,
    ].join(":");

    void this.#lockManager.request(
      lockName,
      { signal: abortController.signal },
      async () => {
        if (!this.#active || generation !== this.#generation) return;
        await new Promise<void>((resolve) => {
          this.#releaseLock = resolve;
          this.#openSocket();
        });
        if (generation === this.#generation) this.#releaseLock = null;
      },
    ).catch((error: unknown) => {
      if ((error as { name?: unknown })?.name !== "AbortError") {
        // Presence telemetry must never interrupt client authentication.
      }
    });
  }

  #openSocket(): void {
    if (!this.#active || !this.#webSocketConstructor) return;

    const url = new URL(this.#apiUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/client-auth/presence/ws`;
    url.search = "";
    if (!this.#identity) return;
    url.searchParams.set("public_key", this.#identity.publicKey);
    url.searchParams.set("employee_id", this.#identity.employeeId);
    url.searchParams.set("device_id", this.#identity.deviceId);

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
    socket.onclose = (event) => {
      if (this.#socket === socket) this.#socket = null;
      this.#clearHeartbeatTimer();
      if (!this.#active) return;
      if (event.code === 1003 || event.code === 1008) {
        this.#active = false;
        return;
      }
      this.#reconnectTimer = setTimeout(() => {
        this.#reconnectTimer = null;
        this.#openSocket();
      }, this.#reconnectDelayMs);
    };
  }

  #sendHeartbeat(socket: WebSocket): void {
    if (
      this.#socket !== socket
      || socket.readyState !== 1
      || !this.#identity
    ) return;
    socket.send(JSON.stringify({
      type: "heartbeat",
      employee_id: this.#identity.employeeId,
      device_id: this.#identity.deviceId,
    }));
  }

  #clearHeartbeatTimer(): void {
    if (this.#heartbeatTimer === null) return;
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
  }
}
